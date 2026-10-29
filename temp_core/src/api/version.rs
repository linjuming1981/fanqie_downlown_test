use std::time::Duration;

use reqwest::Method;
use reqwest::blocking::{Client, Response};
use reqwest::header::{CONTENT_DISPOSITION, LOCATION, RANGE};
use serde::Deserialize;
use serde_json::{Value, json};

#[derive(Deserialize)]
struct VersionRequest {
    url: String,
}

pub fn handle_version_fetch_filename(payload: &[u8]) -> Result<Value, String> {
    let request: VersionRequest = serde_json::from_slice(payload).map_err(|err| err.to_string())?;
    if request.url.is_empty() {
        return Err("version fetch url missing".to_string());
    }

    let client = Client::builder()
        .timeout(Duration::from_secs(8))
        .redirect(reqwest::redirect::Policy::limited(5))
        .build()
        .map_err(|err| err.to_string())?;

    if let Some(filename) = fetch_filename(&client, Method::HEAD, &request.url)
        .or_else(|| fetch_filename(&client, Method::GET, &request.url))
    {
        return Ok(json!({ "filename": filename }));
    }

    Ok(json!({ "filename": serde_json::Value::Null }))
}

fn fetch_filename(client: &Client, method: Method, url: &str) -> Option<String> {
    let mut request = client.request(method.clone(), url);
    if method == Method::GET {
        request = request.header(RANGE, "bytes=0-0");
    }
    let response = request.send().ok()?.error_for_status().ok()?;
    extract_filename(&response)
}

fn extract_filename(response: &Response) -> Option<String> {
    if let Some(header) = response.headers().get(CONTENT_DISPOSITION)
        && let Ok(text) = header.to_str()
        && let Some(name) = parse_content_disposition(text)
    {
        return Some(name);
    }

    if let Some(header) = response.headers().get(LOCATION)
        && let Ok(text) = header.to_str()
        && let Some(name) = extract_from_url(text)
    {
        return Some(name);
    }

    extract_from_url(response.url().path())
}

fn parse_content_disposition(value: &str) -> Option<String> {
    for part in value.split(';') {
        let part = part.trim();
        if let Some(stripped) = part.strip_prefix("filename=") {
            let cleaned = stripped.trim_matches('"');
            if !cleaned.is_empty() {
                return Some(cleaned.to_string());
            }
        }
    }
    None
}

fn extract_from_url(value: &str) -> Option<String> {
    let name = value.rsplit('/').find(|segment| !segment.is_empty())?;
    if name.contains('.') {
        Some(name.to_string())
    } else {
        None
    }
}
