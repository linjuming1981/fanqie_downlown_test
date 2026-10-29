use std::convert::TryFrom;
use std::fmt;
use std::time::Duration;

use http::Error as HttpError;
use reqwest::blocking::Body as ReqwestBody;
use reqwest::blocking::{Client as ReqwestClient, ClientBuilder as ReqwestClientBuilder};
use reqwest::blocking::{RequestBuilder as ReqwestRequestBuilder, Response as ReqwestResponse};
use reqwest::header::{HeaderMap, HeaderValue};
use reqwest::{IntoUrl, Method, Url};
use serde::Serialize;
use serde::de::DeserializeOwned;

pub type NetworkError = reqwest::Error;
pub type Bytes = bytes::Bytes;

#[derive(Clone)]
pub struct HttpClient {
    inner: ReqwestClient,
}

impl fmt::Debug for HttpClient {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("HttpClient").finish_non_exhaustive()
    }
}

impl HttpClient {
    pub fn builder() -> HttpClientBuilder {
        HttpClientBuilder::new()
    }

    pub fn get(&self, url: impl IntoUrl) -> HttpRequestBuilder {
        HttpRequestBuilder::from(self.inner.get(url))
    }

    pub fn post(&self, url: impl IntoUrl) -> HttpRequestBuilder {
        HttpRequestBuilder::from(self.inner.post(url))
    }

    pub fn request(&self, method: Method, url: impl IntoUrl) -> HttpRequestBuilder {
        HttpRequestBuilder::from(self.inner.request(method, url))
    }
}

impl From<ReqwestClient> for HttpClient {
    fn from(inner: ReqwestClient) -> Self {
        Self { inner }
    }
}

pub struct HttpClientBuilder {
    inner: ReqwestClientBuilder,
}

impl HttpClientBuilder {
    pub fn new() -> Self {
        Self {
            inner: ReqwestClient::builder(),
        }
    }

    pub fn default_headers(mut self, headers: HeaderMap) -> Self {
        self.inner = self.inner.default_headers(headers);
        self
    }

    pub fn user_agent<T>(mut self, value: T) -> Self
    where
        HeaderValue: TryFrom<T>,
        <HeaderValue as TryFrom<T>>::Error: Into<HttpError>,
    {
        self.inner = self.inner.user_agent(value);
        self
    }

    pub fn timeout(mut self, timeout: Duration) -> Self {
        self.inner = self.inner.timeout(timeout);
        self
    }

    pub fn proxy(mut self, proxy: reqwest::Proxy) -> Self {
        self.inner = self.inner.proxy(proxy);
        self
    }

    pub fn add_root_certificate(mut self, cert: reqwest::Certificate) -> Self {
        self.inner = self.inner.add_root_certificate(cert);
        self
    }

    pub fn danger_accept_invalid_certs(mut self, enabled: bool) -> Self {
        self.inner = self.inner.danger_accept_invalid_certs(enabled);
        self
    }

    pub fn http1_only(mut self) -> Self {
        self.inner = self.inner.http1_only();
        self
    }

    pub fn build(self) -> Result<HttpClient, NetworkError> {
        self.inner.build().map(HttpClient::from)
    }
}

impl Default for HttpClientBuilder {
    fn default() -> Self {
        Self::new()
    }
}

pub struct HttpRequestBuilder {
    inner: ReqwestRequestBuilder,
}

impl From<ReqwestRequestBuilder> for HttpRequestBuilder {
    fn from(inner: ReqwestRequestBuilder) -> Self {
        Self { inner }
    }
}

impl HttpRequestBuilder {
    pub fn header<K, V>(self, key: K, value: V) -> Self
    where
        reqwest::header::HeaderName: TryFrom<K>,
        <reqwest::header::HeaderName as TryFrom<K>>::Error: Into<HttpError>,
        HeaderValue: TryFrom<V>,
        <HeaderValue as TryFrom<V>>::Error: Into<HttpError>,
    {
        Self {
            inner: self.inner.header(key, value),
        }
    }

    pub fn headers(mut self, headers: HeaderMap) -> Self {
        self.inner = self.inner.headers(headers);
        self
    }

    pub fn json<T: Serialize>(mut self, value: &T) -> Self {
        self.inner = self.inner.json(value);
        self
    }

    pub fn query(mut self, value: &impl Serialize) -> Self {
        self.inner = self.inner.query(value);
        self
    }

    pub fn body(mut self, body: impl Into<ReqwestBody>) -> Self {
        self.inner = self.inner.body(body);
        self
    }

    pub fn timeout(mut self, duration: Duration) -> Self {
        self.inner = self.inner.timeout(duration);
        self
    }

    pub fn send(self) -> Result<HttpResponse, NetworkError> {
        self.inner.send().map(HttpResponse::from)
    }
}

pub struct HttpResponse {
    inner: ReqwestResponse,
}

impl From<ReqwestResponse> for HttpResponse {
    fn from(inner: ReqwestResponse) -> Self {
        Self { inner }
    }
}

impl HttpResponse {
    pub fn status(&self) -> reqwest::StatusCode {
        self.inner.status()
    }

    pub fn json<T: DeserializeOwned>(self) -> Result<T, NetworkError> {
        self.inner.json()
    }

    pub fn text(self) -> Result<String, NetworkError> {
        self.inner.text()
    }

    pub fn bytes(self) -> Result<Bytes, NetworkError> {
        self.inner.bytes()
    }

    pub fn error_for_status(self) -> Result<Self, NetworkError> {
        self.inner.error_for_status().map(HttpResponse::from)
    }

    pub fn headers(&self) -> &HeaderMap {
        self.inner.headers()
    }

    pub fn url(&self) -> &Url {
        self.inner.url()
    }
}
