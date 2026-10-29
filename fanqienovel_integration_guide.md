# 番茄小说下载与解密功能技术迁移与改造指南

本文档旨在为开发人员及 AI 助手（如 Gemini）提供将 **番茄小说下载与解密阅读功能** 迁移或集成到现有项目（如 Node.js + Vue 3 + Element Plus）中的完整技术参考。

---

## 1. 原始开源项目信息
- **GitHub 仓库地址**：[https://github.com/ying-ck/fanqienovel-downloader](https://github.com/ying-ck/fanqienovel-downloader)
- **原始技术栈**：Python (Flask, Requests, Lxml, BeautifulSoup, EbookLib 等)
- **核心功能**：通过小说 ID 或详情页链接，抓取番茄小说元数据、目录列表、章节正文，并支持导出 TXT / EPUB 以及 Web 在线阅读。

---

## 2. 核心技术难点与踩坑点：番茄小说字体反爬（乱码问题）

在直接请求番茄小说阅读页（`https://fanqienovel.com/reader/{chapter_id}`）或通过 API 获取章节内容时，会发现正文内容出现大量乱码（例如：`绝制，沸腾，... 味害怕遇捞蹭饭...`）。

### 原因分析：
番茄小说（字节跳动系）采用了 **Unicode 私有区字体加密混淆（Font Obfuscation / 动态字库映射）**。网页中的文字并不是标准的 Unicode 字符，而是落在了 Private Use Area（私有区，范围通常在 `58344 ~ 58716` 之间）。如果不进行解码，直接渲染会显示为乱码或错乱的字。

---

## 3. 改造方案：纯 Node.js 服务端解密（脱离 Python 依赖）

为了让项目可以平滑地集成到 **Node.js 后端**（支持 Express / NestJS / Koa 等），我们**放弃了在运行时调用 Python 进程**的方案，而是直接将 Python 仓库中的解密字库 `charset.json` 提取出来，在 Node.js 中用纯 JS 实现了对应的解密算法。

### 优势：
1. **零外部环境依赖**：无需在服务器安装 Python 运行环境及复杂 C 依赖（如 `lxml`）。
2. **高性能**：Node.js 内存直接进行字符串映射解密，速度极快。
3. **完美契合全栈 Node 项目**：前后端数据交互均为 JSON，易于与 Vue 3 + Element Plus 前端对接。

---

## 4. 核心解密算法与代码实现（Node.js）

### 4.1 引入字库 `charset.json`
将原项目 `src/charset.json` 复制到你的 Node.js 后端目录下。该文件结构为包含两个字符映射数组的二维数组。

### 4.2 编写解密工具函数 (`decodeText`)

```javascript
const fs = require('fs');
const path = require('path');

// 1. 加载字库
let charsetData = [[], []];
try {
  const charsetPath = path.join(__dirname, 'charset.json');
  if (fs.existsSync(charsetPath)) {
    charsetData = JSON.parse(fs.readFileSync(charsetPath, 'utf-8'));
  }
} catch (e) {
  console.error('Failed to load charset.json:', e);
}

// 2. 乱码解密核心算法
const CODE = [[58344, 58715], [58345, 58716]];
function decodeText(text) {
  if (!text) return '';
  let result = '';
  for (let i = 0; i < text.length; i++) {
    const uni = text.charCodeAt(i);
    let decoded = false;
    for (let mode = 0; mode < CODE.length; mode++) {
      if (uni >= CODE[mode][0] && uni <= CODE[mode][1]) {
        const bias = uni - CODE[mode][0];
        if (bias >= 0 && bias < charsetData[mode].length && charsetData[mode][bias] && charsetData[mode][bias] !== '?') {
          result += charsetData[mode][bias];
          decoded = true;
          break;
        }
      }
    }
    if (!decoded) {
      result += text[i];
    }
  }
  return result;
}

module.exports = { decodeText };
```

---

## 5. 后端 API 接口设计示例 (Express)

在你的 Node.js 后端中建立以下两个核心 API：

### 5.1 获取小说详情与目录列表
```javascript
const express = require('express');
const cheerio = require('cheerio');
const { decodeText } = require('./decoder');
const router = express.Router();

router.get('/api/novel/info', async (req, res) => {
  const novelId = req.query.id || '7529814789015473176';
  try {
    const response = await fetch(`https://fanqienovel.com/page/${novelId}`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0' }
    });
    const html = await response.text();
    const $ = cheerio.load(html);

    const title = decodeText($('h1').first().text().trim());
    const author = decodeText($('.author-info-content, .author-name').first().text().trim());
    const description = decodeText($('.abstract, .book-abstract').first().text().trim());
    const cover = $('.book-cover img, img.thumb').first().attr('src') || '';

    const chapters = [];
    $('a').each((_, el) => {
      const href = $(el).attr('href');
      if (href && href.includes('/reader/')) {
        const chapterId = href.split('/').pop();
        const chapterTitle = decodeText($(el).text().trim());
        if (chapterId && chapterTitle && !chapters.some(c => c.id === chapterId)) {
          chapters.push({ title: chapterTitle, id: chapterId, index: chapters.length + 1 });
        }
      }
    });

    res.json({ success: true, data: { id: novelId, title, author, description, cover, chapters, totalChapters: chapters.length } });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});
```

### 5.2 获取已解密的章节正文
```javascript
router.get('/api/novel/chapter', async (req, res) => {
  const chapterId = req.query.id;
  if (!chapterId) return res.status(400).json({ success: false, error: '缺少章节ID' });

  try {
    const response = await fetch(`https://fanqienovel.com/reader/${chapterId}`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0' }
    });
    const html = await response.text();
    const $ = cheerio.load(html);

    const chapterTitle = decodeText($('.reader-content h1, .chapter-title, h1').first().text().trim());
    
    const paragraphs = [];
    $('.content p, .book-content p, .reader-content p').each((_, el) => {
      const pText = decodeText($(el).text().trim());
      if (pText) paragraphs.push(pText);
    });

    res.json({
      success: true,
      data: {
        id: chapterId,
        title: chapterTitle,
        content: paragraphs.join('\n\n')
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});
```

---

## 6. 前端 (Vue 3 + Element Plus) 对接建议

在你的 Vue 3 项目中，可以使用如下组件进行现代化 UI 搭建：
1. **搜索与输入面板**：使用 `el-input` + `el-button` 输入番茄小说 ID（如 `7529814789015473176`）。
2. **目录展示**：使用 Element Plus 的 `el-table` 或自定义滚动列表展示章节，点击章节触发 `/api/novel/chapter`。
3. **沉浸阅读器**：使用 `el-card` 或抽屉（`el-drawer`），支持背景色切换（暗夜、明亮、护眼绿、羊皮纸）及字号调整。
4. **AI 伴读（可选扩展）**：接入 Google Gemini API (`@google/genai`) 对小说内容进行剧情总结与角色分析。

---
*指南生成时间：2026-10-28*
*适用于 Google AI Studio 及标准 Node.js + Vue 3 开发环境*
