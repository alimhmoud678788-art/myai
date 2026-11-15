//! Local AI engine: downloads the model ("brain") once, then runs llama.cpp's `llama-server`
//! on 127.0.0.1 with a random port and a random API key. Nothing leaves the user's PC.

use std::{
    fs,
    io::Read,
    net::TcpListener,
    path::PathBuf,
    process::{Child, Command, Stdio},
    sync::{
        atomic::{AtomicBool, Ordering},
        Mutex,
    },
    time::{Duration, Instant},
};

use futures_util::StreamExt;
use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, State};
use tokio::io::AsyncWriteExt;

pub struct ModelSpec {
    pub id: &'static str,
    file: &'static str,
    url: &'static str,
    pub approx_bytes: u64,
    pub min_ram_gb: u64,
}

// Qwen3 models are Apache-2.0 licensed (commercial use allowed). Keep in sync with .github/workflows/engine-test.yml
pub const MODELS: &[ModelSpec] = &[
    ModelSpec {
        id: "standard",
        file: "brain-standard.gguf",
        url: "https://huggingface.co/unsloth/Qwen3-4B-Instruct-2507-GGUF/resolve/main/Qwen3-4B-Instruct-2507-Q4_K_M.gguf",
        approx_bytes: 2_500_000_000,
        min_ram_gb: 8,
    },
    ModelSpec {
        id: "lite",
        file: "brain-lite.gguf",
        url: "https://huggingface.co/unsloth/Qwen3-1.7B-GGUF/resolve/main/Qwen3-1.7B-Q4_K_M.gguf",
        approx_bytes: 1_110_000_000,
        min_ram_gb: 4,
    },
];

const CONTEXT_TOKENS: &str = "8192";
const DOWNLOAD_ATTEMPTS: usize = 6;

#[derive(Default)]
pub struct Engine {
    inner: Mutex<Inner>,
    cancel: AtomicBool,
    downloading: AtomicBool,
}

#[derive(Default)]
struct Inner {
    child: Option<Child>,
    port: u16,
    api_key: String,
    model: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Status {
    installed: Vec<String>,
    active: Option<String>,
    running: bool,
    exited: bool,
    port: u16,
    api_key: String,
    downloading: bool,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct Progress {
    id: String,
    done: u64,
    total: Option<u64>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemInfo {
    total_ram_gb: f64,
    threads: usize,
    models: Vec<ModelInfo>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ModelInfo {
    id: &'static str,
    approx_bytes: u64,
    min_ram_gb: u64,
}

fn spec(id: &str) -> Result<&'static ModelSpec, String> {
    MODELS.iter().find(|m| m.id == id).ok_or_else(|| format!("Unknown model: {id}"))
}

fn models_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?.join("models");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

fn log_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_log_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join("engine.log"))
}

fn installed(app: &AppHandle) -> Vec<String> {
    let Ok(dir) = models_dir(app) else { return vec![] };
    MODELS
        .iter()
        .filter(|m| dir.join(m.file).is_file())
        .map(|m| m.id.to_string())
        .collect()
}

fn random_key() -> String {
    let mut buf = [0u8; 24];
    getrandom::fill(&mut buf).expect("OS random generator unavailable");
    buf.iter().map(|b| format!("{b:02x}")).collect()
}

fn free_port() -> Result<u16, String> {
    TcpListener::bind("127.0.0.1:0")
        .and_then(|l| l.local_addr())
        .map(|a| a.port())
        .map_err(|e| e.to_string())
}

fn total_ram_gb() -> f64 {
    #[cfg(windows)]
    {
        use windows_sys::Win32::System::SystemInformation::{GlobalMemoryStatusEx, MEMORYSTATUSEX};
        let mut st: MEMORYSTATUSEX = unsafe { std::mem::zeroed() };
        st.dwLength = std::mem::size_of::<MEMORYSTATUSEX>() as u32;
        if unsafe { GlobalMemoryStatusEx(&mut st) } != 0 {
            return st.ullTotalPhys as f64 / 1_073_741_824.0;
        }
        0.0
    }
    #[cfg(not(windows))]
    {
        fs::read_to_string("/proc/meminfo")
            .ok()
            .and_then(|s| {
                s.lines()
                    .find(|l| l.starts_with("MemTotal:"))
                    .and_then(|l| l.split_whitespace().nth(1)?.parse::<f64>().ok())
            })
            .map(|kb| kb / 1_048_576.0)
            .unwrap_or(0.0)
    }
}

/// Windows: put the engine in a Job Object that is killed when MyAI exits or crashes,
/// so a multi-GB llama-server process is never left running in the background.
#[cfg(windows)]
fn kill_with_parent(child: &Child) {
    use std::os::windows::io::AsRawHandle;
    use windows_sys::Win32::System::JobObjects::{
        AssignProcessToJobObject, CreateJobObjectW, JobObjectExtendedLimitInformation,
        SetInformationJobObject, JOBOBJECT_EXTENDED_LIMIT_INFORMATION,
        JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
    };
    unsafe {
        let job = CreateJobObjectW(std::ptr::null(), std::ptr::null());
        if job.is_null() {
            return;
        }
        let mut info: JOBOBJECT_EXTENDED_LIMIT_INFORMATION = std::mem::zeroed();
        info.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
        SetInformationJobObject(
            job,
            JobObjectExtendedLimitInformation,
            &info as *const _ as *const core::ffi::c_void,
            std::mem::size_of::<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>() as u32,
        );
        AssignProcessToJobObject(job, child.as_raw_handle() as _);
        // The job handle is intentionally kept open for the app's lifetime.
    }
}

impl Engine {
    fn status(&self, app: &AppHandle) -> Status {
        let mut inner = self.inner.lock().unwrap();
        let mut exited = false;
        if let Some(child) = inner.child.as_mut() {
            if !matches!(child.try_wait(), Ok(None)) {
                exited = true;
                inner.child = None;
            }
        }
        Status {
            installed: installed(app),
            active: inner.model.clone(),
            running: inner.child.is_some(),
            exited,
            port: inner.port,
            api_key: inner.api_key.clone(),
            downloading: self.downloading.load(Ordering::SeqCst),
        }
    }

    pub fn stop(&self) {
        let mut inner = self.inner.lock().unwrap();
        if let Some(mut child) = inner.child.take() {
            let _ = child.kill();
            let _ = child.wait();
        }
        inner.model = None;
    }
}

#[tauri::command]
pub fn system_info() -> SystemInfo {
    SystemInfo {
        total_ram_gb: (total_ram_gb() * 10.0).round() / 10.0,
        threads: std::thread::available_parallelism().map(|n| n.get()).unwrap_or(4),
        models: MODELS
            .iter()
            .map(|m| ModelInfo { id: m.id, approx_bytes: m.approx_bytes, min_ram_gb: m.min_ram_gb })
            .collect(),
    }
}

#[tauri::command]
pub fn engine_status(app: AppHandle, engine: State<'_, Engine>) -> Status {
    engine.status(&app)
}

/// Starts llama-server with the given model (no-op if it is already running that model).
#[tauri::command]
pub fn start_engine(app: AppHandle, engine: State<'_, Engine>, id: String) -> Result<Status, String> {
    let m = spec(&id)?;
    let model_path = models_dir(&app)?.join(m.file);
    if !model_path.is_file() {
        return Err("MODEL_NOT_INSTALLED".into());
    }
    {
        let st = engine.status(&app);
        if st.running && st.active.as_deref() == Some(m.id) {
            return Ok(st);
        }
    }
    engine.stop();

    let exe_name = if cfg!(windows) { "llama-server.exe" } else { "llama-server" };
    let exe = app
        .path()
        .resource_dir()
        .map_err(|e| e.to_string())?
        .join("llama")
        .join(exe_name);
    if !exe.is_file() {
        return Err(format!("ENGINE_MISSING: {}", exe.display()));
    }

    let port = free_port()?;
    let api_key = random_key();
    let log = fs::File::create(log_path(&app)?).map_err(|e| e.to_string())?;
    let log_err = log.try_clone().map_err(|e| e.to_string())?;

    let mut cmd = Command::new(&exe);
    cmd.arg("-m")
        .arg(&model_path)
        .args(["--host", "127.0.0.1", "--port", &port.to_string()])
        .args(["--api-key", &api_key])
        .args(["-c", CONTEXT_TOKENS])
        .args(["--jinja", "--no-webui"])
        .current_dir(exe.parent().unwrap())
        .stdin(Stdio::null())
        .stdout(Stdio::from(log))
        .stderr(Stdio::from(log_err));
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    let child = cmd.spawn().map_err(|e| format!("ENGINE_SPAWN: {e}"))?;
    #[cfg(windows)]
    kill_with_parent(&child);

    {
        let mut inner = engine.inner.lock().unwrap();
        inner.child = Some(child);
        inner.port = port;
        inner.api_key = api_key;
        inner.model = Some(m.id.to_string());
    }
    Ok(engine.status(&app))
}

/// Last lines of the engine log, shown to the user when the engine fails to start.
#[tauri::command]
pub fn engine_log_tail(app: AppHandle) -> String {
    let Ok(path) = log_path(&app) else { return String::new() };
    let mut s = String::new();
    if let Ok(mut f) = fs::File::open(path) {
        let _ = f.read_to_string(&mut s);
    }
    let lines: Vec<&str> = s.lines().collect();
    lines[lines.len().saturating_sub(15)..].join("\n")
}

struct DownloadFlag<'a>(&'a AtomicBool);
impl Drop for DownloadFlag<'_> {
    fn drop(&mut self) {
        self.0.store(false, Ordering::SeqCst);
    }
}

/// Downloads a model with resume support and automatic retries; emits `download-progress` events.
#[tauri::command]
pub async fn download_model(app: AppHandle, engine: State<'_, Engine>, id: String) -> Result<(), String> {
    let m = spec(&id)?;
    if engine.downloading.swap(true, Ordering::SeqCst) {
        return Err("ALREADY_DOWNLOADING".into());
    }
    let _flag = DownloadFlag(&engine.downloading);
    engine.cancel.store(false, Ordering::SeqCst);

    let dir = models_dir(&app)?;
    let final_path = dir.join(m.file);
    let part = dir.join(format!("{}.part", m.file));
    let client = reqwest::Client::builder()
        .user_agent("MyAI-Desktop")
        .connect_timeout(Duration::from_secs(20))
        .read_timeout(Duration::from_secs(60))
        .build()
        .map_err(|e| e.to_string())?;

    let mut last_err = String::new();
    for attempt in 0..DOWNLOAD_ATTEMPTS {
        if attempt > 0 {
            tokio::time::sleep(Duration::from_secs(2 * attempt as u64)).await;
        }
        match download_once(&app, &engine, &client, m, &part).await {
            Ok(()) => {
                let mut magic = [0u8; 4];
                fs::File::open(&part)
                    .and_then(|mut f| f.read_exact(&mut magic))
                    .map_err(|e| e.to_string())?;
                if &magic != b"GGUF" {
                    let _ = fs::remove_file(&part);
                    return Err("DOWNLOAD_CORRUPT".into());
                }
                fs::rename(&part, &final_path).map_err(|e| e.to_string())?;
                return Ok(());
            }
            Err(e) if e == "CANCELLED" => return Err(e),
            Err(e) => last_err = e,
        }
    }
    Err(format!("DOWNLOAD_FAILED: {last_err}"))
}

async fn download_once(
    app: &AppHandle,
    engine: &Engine,
    client: &reqwest::Client,
    m: &ModelSpec,
    part: &PathBuf,
) -> Result<(), String> {
    let mut start = fs::metadata(part).map(|md| md.len()).unwrap_or(0);
    let mut req = client.get(m.url);
    if start > 0 {
        req = req.header(reqwest::header::RANGE, format!("bytes={start}-"));
    }
    let resp = req.send().await.map_err(|e| e.to_string())?;
    let status = resp.status();
    if status == reqwest::StatusCode::RANGE_NOT_SATISFIABLE && start > 0 {
        return Ok(()); // already complete
    }
    if !status.is_success() {
        return Err(format!("HTTP {status}"));
    }
    if start > 0 && status != reqwest::StatusCode::PARTIAL_CONTENT {
        start = 0; // server ignored the range: restart from zero
    }
    let total = resp.content_length().map(|len| len + start);

    let mut file = if start > 0 {
        tokio::fs::OpenOptions::new().append(true).open(part).await
    } else {
        tokio::fs::File::create(part).await
    }
    .map_err(|e| e.to_string())?;

    let mut done = start;
    let mut last_emit = Instant::now() - Duration::from_secs(1);
    let mut stream = resp.bytes_stream();
    while let Some(chunk) = stream.next().await {
        if engine.cancel.load(Ordering::SeqCst) {
            let _ = file.flush().await;
            return Err("CANCELLED".into());
        }
        let chunk = chunk.map_err(|e| e.to_string())?;
        file.write_all(&chunk).await.map_err(|e| e.to_string())?;
        done += chunk.len() as u64;
        if last_emit.elapsed() >= Duration::from_millis(250) {
            last_emit = Instant::now();
            let _ = app.emit("download-progress", Progress { id: m.id.into(), done, total });
        }
    }
    file.flush().await.map_err(|e| e.to_string())?;
    let _ = app.emit("download-progress", Progress { id: m.id.into(), done, total });
    match total {
        Some(t) if done < t => Err("INCOMPLETE".into()),
        _ => Ok(()),
    }
}

#[tauri::command]
pub fn cancel_download(engine: State<'_, Engine>) {
    engine.cancel.store(true, Ordering::SeqCst);
}

#[tauri::command]
pub fn delete_model(app: AppHandle, engine: State<'_, Engine>, id: String) -> Result<(), String> {
    let m = spec(&id)?;
    if engine.inner.lock().unwrap().model.as_deref() == Some(m.id) {
        engine.stop();
    }
    let dir = models_dir(&app)?;
    for name in [m.file.to_string(), format!("{}.part", m.file)] {
        let p = dir.join(name);
        if p.exists() {
            fs::remove_file(p).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}
