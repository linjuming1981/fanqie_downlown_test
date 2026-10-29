mod api;
pub mod ffi;
mod http;

pub mod blocking {
    pub use crate::http::{HttpClient as Client, HttpClientBuilder as ClientBuilder};
    pub use crate::http::{HttpRequestBuilder as RequestBuilder, HttpResponse as Response};
}

pub mod headers {
    pub use reqwest::header::*;
}

pub use http::{Bytes, NetworkError};
pub use reqwest::Certificate;
pub use reqwest::IntoUrl;
pub use reqwest::Method;
pub use reqwest::Proxy;
pub use reqwest::Url;

pub type NetworkResult<T> = Result<T, NetworkError>;
