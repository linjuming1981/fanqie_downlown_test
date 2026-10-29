use std::time::Duration;

use reqwest::blocking::Client;
use reqwest::header::{ACCEPT, CONNECTION, HeaderMap, HeaderValue, REFERER, USER_AGENT};
use serde::Deserialize;
use serde_json::Value;

const DIRECTORY_URL: &str = "https://fanqienovel.com/api/reader/directory/detail";
const DEFAULT_USER_AGENT: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

#[derive(Deserialize)]
struct DirectoryDetailRequest {
    #[serde(default)]
    url: Option<String>,
    book_id: String,
    #[serde(default)]
    user_agent: Option<String>,
    #[serde(default)]
    install_id: Option<String>,
}

pub fn handle_directory_detail(payload: &[u8]) -> Result<Value, String> {
    let req: DirectoryDetailRequest = serde_json::from_slice(payload).map_err(|e| e.to_string())?;
    if req.book_id.trim().is_empty() {
        return Err("book_id missing".to_string());
    }

    let url = req.url.as_deref().unwrap_or(DIRECTORY_URL);
    let api_url = format!("{}?bookId={}", url, req.book_id);

    // first attempt
    match call_directory(&api_url, &req) {
        Ok(v) => Ok(v),
        Err(err) => {
            // simple warm-up and retry once (fanqienovel.com sometimes requires a warm page hit)
            let _ = warm_page(&req.book_id, &req);
            call_directory(&api_url, &req).map_err(|e| format!("{}; retry: {}", err, e))
        }
    }
}

fn call_directory(api_url: &str, req: &DirectoryDetailRequest) -> Result<Value, String> {
    let client = build_client().map_err(|e| e.to_string())?;

    let mut headers = HeaderMap::new();
    headers.insert(
        USER_AGENT,
        HeaderValue::from_str(req.user_agent.as_deref().unwrap_or(DEFAULT_USER_AGENT))
            .map_err(|e| e.to_string())?,
    );
    headers.insert(ACCEPT, HeaderValue::from_static("application/json, text/plain, */*"));
    headers.insert(CONNECTION, HeaderValue::from_static("keep-alive"));
    headers.insert(
        REFERER,
        HeaderValue::from_str(&format!("https://fanqienovel.com/page/{}", req.book_id))
            .map_err(|e| e.to_string())?,
    );

    // Optional cookie (may help some environments)
    if let Some(iid) = req.install_id.as_deref().filter(|s| !s.is_empty()) {
        headers.insert(
            reqwest::header::COOKIE,
            HeaderValue::from_str(&format!("install_id={}", iid)).map_err(|e| e.to_string())?,
        );
    }

    client
        .get(api_url)
        .headers(headers)
        .send()
        .map_err(|e| e.to_string())?
        .error_for_status()
        .map_err(|e| e.to_string())?
        .json::<Value>()
        .map_err(|e| e.to_string())
}

fn warm_page(book_id: &str, req: &DirectoryDetailRequest) -> Result<(), String> {
    let client = build_client().map_err(|e| e.to_string())?;

    let mut headers = HeaderMap::new();
    headers.insert(
        USER_AGENT,
        HeaderValue::from_str(req.user_agent.as_deref().unwrap_or(DEFAULT_USER_AGENT))
            .map_err(|e| e.to_string())?,
    );
    headers.insert(ACCEPT, HeaderValue::from_static("text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"));
    headers.insert(CONNECTION, HeaderValue::from_static("keep-alive"));

    let _ = client
        .get(format!("https://fanqienovel.com/page/{}", book_id))
        .headers(headers)
        .send();
    Ok(())
}

fn build_client() -> Result<Client, reqwest::Error> {
    Client::builder().timeout(Duration::from_secs(15)).build()
}
