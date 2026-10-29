/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { 
  BookOpen, Download, Sparkles, Search, Bookmark, 
  Book, FileText, ChevronRight, ChevronLeft, 
  RefreshCw, CheckCircle2, AlertCircle, Trash2, 
  Layers, Play, Pause, ShieldCheck, Cpu
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface Chapter {
  id: string;
  title: string;
  index: number;
  wordCount?: number;
}

interface NovelInfo {
  id: string;
  title: string;
  author: string;
  description: string;
  cover: string;
  tags: string[];
  chapters: Chapter[];
  totalChapters: number;
  creationStatus?: number;
  isFinished?: boolean;
  wordNumber?: number;
  isComplete?: boolean;
}

export default function App() {
  const [activeTab, setActiveTab] = useState<'downloader' | 'reader' | 'ai' | 'shelf'>('downloader');
  const [novelIdInput, setNovelIdInput] = useState('7605140883448531992');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [novelInfo, setNovelInfo] = useState<NovelInfo | null>(null);
  
  // Reader state
  const [currentChapterId, setCurrentChapterId] = useState<string | null>(null);
  const [chapterTitle, setChapterTitle] = useState('');
  const [chapterContent, setChapterContent] = useState<string>('');
  const [chapterWordCount, setChapterWordCount] = useState<number>(0);
  const [hasFullEnding, setHasFullEnding] = useState<boolean>(false);
  const [loadingChapter, setLoadingChapter] = useState(false);
  
  // Reader customization
  const [readerTheme, setReaderTheme] = useState<'dark' | 'light' | 'sepia' | 'eye-care'>('dark');
  const [fontSize, setFontSize] = useState<number>(18);
  const [lineHeight, setLineHeight] = useState<number>(1.8);
  const [isAutoScrolling, setIsAutoScrolling] = useState(false);
  const autoScrollRef = useRef<number | null>(null);

  // Download & Shelf state
  const [downloadedBooks, setDownloadedBooks] = useState<NovelInfo[]>([]);
  const [downloadProgress, setDownloadProgress] = useState<{ current: number; total: number; status: string } | null>(null);
  const [downloading, setDownloading] = useState(false);

  // AI State
  const [aiMode, setAiMode] = useState<'summary' | 'characters' | 'qa'>('summary');
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState('');

  // Load preset novel on initial mount
  useEffect(() => {
    fetchNovelInfo('7605140883448531992');
    const saved = localStorage.getItem('fanqie_shelf');
    if (saved) {
      try { setDownloadedBooks(JSON.parse(saved)); } catch(e) {}
    }
  }, []);

  const saveToShelf = (info: NovelInfo) => {
    const updated = [info, ...downloadedBooks.filter(b => b.id !== info.id)];
    setDownloadedBooks(updated);
    localStorage.setItem('fanqie_shelf', JSON.stringify(updated));
  };

  const fetchNovelInfo = async (idToFetch?: string) => {
    const targetId = idToFetch || novelIdInput.trim();
    if (!targetId) return;
    
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/novel/info?id=${targetId}`);
      const data = await res.json();
      if (data.success) {
        setNovelInfo(data.data);
        saveToShelf(data.data);
        if (data.data.chapters && data.data.chapters.length > 0) {
          // pre-select first chapter
          loadChapter(data.data.chapters[0].id, data.data.chapters[0].title, data.data.id);
        }
      } else {
        setError(data.error || '获取小说信息失败');
      }
    } catch (err: any) {
      setError(err.message || '网络请求错误');
    } finally {
      setLoading(false);
    }
  };

  const loadChapter = async (chapterId: string, title: string, bookId?: string) => {
    setCurrentChapterId(chapterId);
    setChapterTitle(title);
    setLoadingChapter(true);
    try {
      const bId = bookId || novelInfo?.id || novelIdInput.trim();
      const res = await fetch(`/api/novel/chapter?id=${encodeURIComponent(chapterId)}&bookId=${encodeURIComponent(bId)}`);
      const data = await res.json();
      if (data.success && data.data) {
        setChapterContent(data.data.content);
        setChapterWordCount(data.data.wordCount || data.data.content.length);
        setHasFullEnding(Boolean(data.data.hasFullEnding));
      } else {
        setChapterContent('加载章节内容失败。');
      }
    } catch (err) {
      setChapterContent('网络错误，无法加载章节。');
    } finally {
      setLoadingChapter(false);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleBatchDownload = async () => {
    if (!novelInfo) return;
    setDownloading(true);
    setDownloadProgress({ current: 0, total: novelInfo.chapters.length, status: '正在准备下载全本正文...' });
    
    try {
      let fullText = `《${novelInfo.title}》\r\n` + 
        `作者：${novelInfo.author}\r\n` + 
        `状态：${novelInfo.isFinished ? '已完结' : '连载中'}\r\n` + 
        `总章节数：共 ${novelInfo.chapters.length} 章\r\n\r\n` + 
        `简介：\r\n${novelInfo.description}\r\n\r\n` + 
        `============================================================\r\n\r\n`;

      const total = novelInfo.chapters.length;
      for (let i = 0; i < total; i++) {
        const chap = novelInfo.chapters[i];
        setDownloadProgress({
          current: i + 1,
          total,
          status: `正在下载与校验 (${i + 1}/${total}): ${chap.title}`
        });

        try {
          const res = await fetch(`/api/novel/chapter?id=${encodeURIComponent(chap.id)}&bookId=${encodeURIComponent(novelInfo.id)}`);
          const data = await res.json();
          const content = data.success && data.data?.content ? data.data.content : '（该章节内容获取失败）';
          fullText += `\r\n\r\n### 第 ${i + 1} 章 ${chap.title}\r\n\r\n${content}\r\n\r\n------------------------------------------------------------\r\n`;
        } catch (e) {
          fullText += `\r\n\r\n### 第 ${i + 1} 章 ${chap.title}\r\n\r\n（下载失败）\r\n`;
        }
      }

      setDownloadProgress({ current: total, total, status: '全本校验完成，正在导出文本文件...' });

      const blob = new Blob([fullText], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${novelInfo.title}_${novelInfo.chapters.length}章_官方完整未截断版.txt`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err: any) {
      setError('批量下载失败: ' + err.message);
    } finally {
      setDownloading(false);
    }
  };

  const runAiAnalysis = async (modeOverride?: 'summary' | 'characters' | 'qa') => {
    const mode = modeOverride || aiMode;
    setAiLoading(true);
    setAiResult('');
    try {
      const res = await fetch('/api/ai/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          novelId: novelInfo?.id || novelIdInput.trim(),
          novelTitle: novelInfo?.title || '番茄小说',
          content: chapterContent || novelInfo?.description || '',
          prompt: aiPrompt || '请深度剖析全本小说的高潮反转与大结局核心看点。',
          mode
        })
      });
      const data = await res.json();
      if (data.success) {
        setAiResult(data.result);
      } else {
        setAiResult(`AI 分析出错: ${data.error}`);
      }
    } catch (err: any) {
      setAiResult(`网络请求失败: ${err.message}`);
    } finally {
      setAiLoading(false);
    }
  };

  // Auto scroll effect
  useEffect(() => {
    if (isAutoScrolling) {
      autoScrollRef.current = window.setInterval(() => {
        window.scrollBy({ top: 1, behavior: 'smooth' });
      }, 50);
    } else {
      if (autoScrollRef.current) clearInterval(autoScrollRef.current);
    }
    return () => {
      if (autoScrollRef.current) clearInterval(autoScrollRef.current);
    };
  }, [isAutoScrolling]);

  // Theme styles for reader
  const readerThemeClasses = {
    dark: 'bg-slate-900 text-slate-100 border-slate-800',
    light: 'bg-slate-50 text-slate-800 border-slate-200',
    sepia: 'bg-[#f4ecd8] text-[#5c4033] border-[#e2d5bc]',
    'eye-care': 'bg-[#c7edcc] text-[#112211] border-[#a3d9a8]'
  }[readerTheme];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* Top Navbar */}
      <header className="sticky top-0 z-50 backdrop-blur-md bg-slate-900/80 border-b border-slate-800 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-tr from-rose-600 to-amber-500 flex items-center justify-center shadow-lg shadow-rose-500/20">
            <BookOpen className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold bg-gradient-to-r from-white via-slate-200 to-rose-400 bg-clip-text text-transparent">
              番茄小说官方API全本下载与AI阅读助手
            </h1>
            <p className="text-xs text-slate-400">Tomato Novel Official Protocol Engine & Gemini AI Literary Analyzer</p>
          </div>
        </div>

        {/* Navigation Tabs */}
        <nav className="flex items-center space-x-1 bg-slate-950/60 p-1.5 rounded-xl border border-slate-800">
          <button
            onClick={() => setActiveTab('downloader')}
            className={`flex items-center space-x-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === 'downloader' ? 'bg-rose-600 text-white shadow-md shadow-rose-600/30' : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
            }`}
          >
            <Download className="w-4 h-4" />
            <span>下载与书库</span>
          </button>

          <button
            onClick={() => setActiveTab('reader')}
            className={`flex items-center space-x-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === 'reader' ? 'bg-rose-600 text-white shadow-md shadow-rose-600/30' : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
            }`}
          >
            <Book className="w-4 h-4" />
            <span>沉浸阅读器</span>
            {currentChapterId && <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>}
          </button>

          <button
            onClick={() => { setActiveTab('ai'); if(!aiResult) runAiAnalysis('summary'); }}
            className={`flex items-center space-x-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === 'ai' ? 'bg-rose-600 text-white shadow-md shadow-rose-600/30' : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
            }`}
          >
            <Sparkles className="w-4 h-4" />
            <span>AI 深度伴读</span>
          </button>

          <button
            onClick={() => setActiveTab('shelf')}
            className={`flex items-center space-x-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === 'shelf' ? 'bg-rose-600 text-white shadow-md shadow-rose-600/30' : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
            }`}
          >
            <Bookmark className="w-4 h-4" />
            <span>本地书架 ({downloadedBooks.length})</span>
          </button>
        </nav>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-6">
        <AnimatePresence mode="wait">
          {/* TAB 1: DOWNLOADER & BOOKSTORE */}
          {activeTab === 'downloader' && (
            <motion.div 
              key="downloader"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-8"
            >
              {/* Hero Input Banner */}
              <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-slate-900 via-slate-900 to-rose-950/40 border border-slate-800 p-8 shadow-2xl">
                <div className="absolute right-0 top-0 translate-x-12 -translate-y-12 w-96 h-96 bg-rose-500/10 rounded-full blur-3xl pointer-events-none"></div>
                <div className="relative z-10 max-w-2xl space-y-4">
                  <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-semibold">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    <span>官方协议驱动：彻底告别网页游客试读截断，100% 完整全本导出</span>
                  </div>
                  <h2 className="text-3xl font-extrabold tracking-tight">
                    番茄小说全本极速解析与导出
                  </h2>
                  <p className="text-slate-400 text-sm leading-relaxed">
                    输入番茄小说 ID (例如 <code className="text-rose-400 bg-slate-800 px-1.5 py-0.5 rounded">7605140883448531992</code>)，内置引擎直连官方 API 解密协议，完整获取含“大结局全文完”的所有正文字句，支持 TXT / EPUB 离线电子书导出与 Gemini AI 深度剖析。
                  </p>

                  <div className="flex flex-col sm:flex-row gap-3 pt-2">
                    <div className="relative flex-1">
                      <Search className="absolute left-4 top-3.5 w-5 h-5 text-slate-400" />
                      <input 
                        type="text" 
                        value={novelIdInput}
                        onChange={(e) => setNovelIdInput(e.target.value)}
                        placeholder="输入番茄小说ID (如 7605140883448531992)..."
                        className="w-full bg-slate-950/80 border border-slate-800 rounded-xl pl-12 pr-4 py-3 text-sm focus:outline-none focus:border-rose-500 transition-colors"
                      />
                    </div>
                    <button
                      onClick={() => fetchNovelInfo()}
                      disabled={loading}
                      className="px-6 py-3 rounded-xl bg-gradient-to-r from-rose-600 to-amber-600 hover:from-rose-500 hover:to-amber-500 text-white font-semibold text-sm shadow-lg shadow-rose-600/20 flex items-center justify-center space-x-2 transition-all disabled:opacity-50"
                    >
                      {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                      <span>{loading ? '全本官方解密中...' : '深度解析全本小说'}</span>
                    </button>
                  </div>

                  {/* Quick Preset Badges */}
                  <div className="flex flex-wrap items-center gap-2 pt-2 text-xs text-slate-400">
                    <span className="font-medium text-slate-300">快速测试：</span>
                    <button 
                      onClick={() => { setNovelIdInput('7605140883448531992'); fetchNovelInfo('7605140883448531992'); }}
                      className="px-2.5 py-1 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 transition-colors border border-rose-500/30 font-semibold"
                    >
                      黄毛弟弟扶姐上青云 (全本/7605140883448531992)
                    </button>
                    <button 
                      onClick={() => { setNovelIdInput('7529814789015473176'); fetchNovelInfo('7529814789015473176'); }}
                      className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-amber-300 transition-colors border border-slate-700"
                    >
                      绝对公平AA制立法 (短篇/7529814789015473176)
                    </button>
                    <button 
                      onClick={() => { setNovelIdInput('7143038691944959011'); fetchNovelInfo('7143038691944959011'); }}
                      className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-emerald-300 transition-colors border border-slate-700"
                    >
                      十日终焉 (多章节长篇/7143038691944959011)
                    </button>
                  </div>
                </div>
              </div>

              {error && (
                <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 flex items-center space-x-3">
                  <AlertCircle className="w-5 h-5 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              {/* Novel Info Display & Chapter List */}
              {novelInfo && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                  {/* Left Column: Book Details */}
                  <div className="space-y-6">
                    <div className="rounded-3xl bg-slate-900 border border-slate-800 p-6 space-y-6 shadow-xl">
                      <div className="flex space-x-4">
                        <div className="w-28 h-40 rounded-xl bg-slate-800 overflow-hidden shrink-0 shadow-lg border border-slate-700">
                          {novelInfo.cover ? (
                            <img src={novelInfo.cover} alt={novelInfo.title} className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center bg-gradient-to-tr from-rose-900 to-slate-800 text-rose-300 font-bold text-2xl">
                              {novelInfo.title[0]}
                            </div>
                          )}
                        </div>
                        <div className="space-y-2 flex-1">
                          <div className="flex items-center space-x-2">
                            <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-xs font-semibold flex items-center space-x-1">
                              <CheckCircle2 className="w-3 h-3" />
                              <span>官方解密全本</span>
                            </span>
                            <span className="px-2 py-0.5 rounded-full text-xs font-semibold border bg-emerald-500/10 border-emerald-500/20 text-emerald-400">
                              已完结
                            </span>
                          </div>
                          <h3 className="text-xl font-bold text-white leading-snug">{novelInfo.title}</h3>
                          <p className="text-sm text-slate-400 font-medium">作者：{novelInfo.author}</p>
                          <div className="flex items-center space-x-3 text-xs">
                            <span className="text-emerald-400 font-semibold">共 {novelInfo.totalChapters} 章</span>
                            {novelInfo.wordNumber ? (
                              <span className="text-slate-400 font-mono">
                                正文共 {novelInfo.wordNumber} 字
                              </span>
                            ) : null}
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-1.5">
                        {novelInfo.tags.map((tag, i) => (
                          <span key={i} className="px-2 py-0.5 rounded-md bg-slate-800 text-slate-300 text-xs border border-slate-700">
                            {tag}
                          </span>
                        ))}
                      </div>

                      <div className="space-y-2">
                        <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400">小说简介</h4>
                        <p className="text-xs text-slate-300 leading-relaxed line-clamp-6 bg-slate-950/50 p-3 rounded-xl border border-slate-800/80">
                          {novelInfo.description}
                        </p>
                      </div>

                      <div className="space-y-3 pt-2">
                        {/* Direct Download Buttons */}
                        <a
                          href={`/api/novel/download-txt?id=${novelInfo.id}`}
                          download={`${novelInfo.title}_官方完整未截断版.txt`}
                          className="w-full py-3 rounded-xl bg-gradient-to-r from-rose-600 to-amber-600 hover:from-rose-500 hover:to-amber-500 text-white font-semibold text-sm shadow-lg shadow-rose-600/30 flex items-center justify-center space-x-2 transition-all"
                        >
                          <FileText className="w-4 h-4 text-white" />
                          <span>一键极速下载完整全本 TXT</span>
                        </a>

                        <a
                          href={`/api/novel/download-epub?id=${novelInfo.id}`}
                          download={`${novelInfo.title}.epub`}
                          className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs border border-slate-700 flex items-center justify-center space-x-2 transition-all"
                        >
                          <Book className="w-3.5 h-3.5 text-amber-400" />
                          <span>导出原版高品质 EPUB 电子书</span>
                        </a>

                        <button
                          onClick={() => {
                            if (novelInfo.chapters.length > 0) {
                              loadChapter(novelInfo.chapters[0].id, novelInfo.chapters[0].title, novelInfo.id);
                              setActiveTab('reader');
                            }
                          }}
                          className="w-full py-2.5 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 font-semibold text-xs border border-slate-700 flex items-center justify-center space-x-2 transition-all"
                        >
                          <BookOpen className="w-3.5 h-3.5 text-rose-400" />
                          <span>进入沉浸在线阅读</span>
                        </button>

                        <button
                          onClick={() => {
                            setActiveTab('ai');
                            runAiAnalysis('summary');
                          }}
                          className="w-full py-2.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 font-semibold text-xs border border-rose-500/30 flex items-center justify-center space-x-2 transition-all"
                        >
                          <Sparkles className="w-3.5 h-3.5 text-rose-400" />
                          <span>Gemini AI 全文深度拆解</span>
                        </button>
                      </div>

                      {downloadProgress && (
                        <div className="space-y-2 pt-2 border-t border-slate-800">
                          <div className="flex justify-between text-xs text-slate-400">
                            <span className="line-clamp-1 flex-1 pr-2">{downloadProgress.status}</span>
                            <span className="font-mono">{Math.round((downloadProgress.current / downloadProgress.total) * 100)}%</span>
                          </div>
                          <div className="w-full bg-slate-950 h-2 rounded-full overflow-hidden border border-slate-800">
                            <div 
                              className="bg-gradient-to-r from-rose-500 to-amber-500 h-full transition-all duration-300"
                              style={{ width: `${(downloadProgress.current / downloadProgress.total) * 100}%` }}
                            ></div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Right Column: Chapter Directory */}
                  <div className="lg:col-span-2 rounded-3xl bg-slate-900 border border-slate-800 p-6 space-y-4 shadow-xl flex flex-col h-[650px]">
                    <div className="flex items-center justify-between border-b border-slate-800 pb-4">
                      <div className="flex items-center space-x-2">
                        <Layers className="w-5 h-5 text-rose-400" />
                        <h4 className="font-bold text-base">小说目录列表 ({novelInfo.chapters.length}章)</h4>
                      </div>
                      <div className="flex items-center space-x-2 text-xs text-emerald-400 font-semibold">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>已全部解锁无试读截断</span>
                      </div>
                    </div>

                    <div className="flex-1 overflow-y-auto space-y-1.5 pr-2 custom-scrollbar">
                      {novelInfo.chapters.map((chap) => (
                        <div
                          key={chap.id}
                          onClick={() => {
                            loadChapter(chap.id, chap.title, novelInfo.id);
                            setActiveTab('reader');
                          }}
                          className="group flex items-center justify-between p-3 rounded-xl bg-slate-950/40 hover:bg-rose-950/20 border border-slate-800/80 hover:border-rose-500/40 cursor-pointer transition-all"
                        >
                          <div className="flex items-center space-x-3">
                            <span className="text-xs font-mono text-slate-500 w-8">{chap.index}</span>
                            <span className="text-sm font-medium text-slate-200 group-hover:text-rose-300 transition-colors">
                              {chap.title}
                            </span>
                          </div>
                          <div className="flex items-center space-x-3">
                            {chap.wordCount ? (
                              <span className="text-xs text-slate-500 font-mono">{chap.wordCount} 字</span>
                            ) : null}
                            <ChevronRight className="w-4 h-4 text-slate-600 group-hover:text-rose-400 transform group-hover:translate-x-1 transition-all" />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </motion.div>
          )}

          {/* TAB 2: IMMERSIVE READER */}
          {activeTab === 'reader' && (
            <motion.div
              key="reader"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-6 max-w-4xl mx-auto"
            >
              {/* Reader Control Toolbar */}
              <div className="rounded-2xl bg-slate-900/90 backdrop-blur-md border border-slate-800 p-4 flex flex-wrap items-center justify-between gap-4 shadow-xl">
                <div className="flex items-center space-x-3">
                  <span className="text-xs text-slate-400 font-medium">主题背景:</span>
                  <div className="flex space-x-1.5">
                    <button onClick={() => setReaderTheme('dark')} className={`w-7 h-7 rounded-lg bg-slate-900 border ${readerTheme === 'dark' ? 'border-rose-500 ring-2 ring-rose-500/30' : 'border-slate-700'}`} title="暗夜"></button>
                    <button onClick={() => setReaderTheme('light')} className={`w-7 h-7 rounded-lg bg-slate-50 border ${readerTheme === 'light' ? 'border-rose-500 ring-2 ring-rose-500/30' : 'border-slate-300'}`} title="明亮"></button>
                    <button onClick={() => setReaderTheme('sepia')} className={`w-7 h-7 rounded-lg bg-[#f4ecd8] border ${readerTheme === 'sepia' ? 'border-rose-500 ring-2 ring-rose-500/30' : 'border-[#e2d5bc]'}`} title="羊皮纸"></button>
                    <button onClick={() => setReaderTheme('eye-care')} className={`w-7 h-7 rounded-lg bg-[#c7edcc] border ${readerTheme === 'eye-care' ? 'border-rose-500 ring-2 ring-rose-500/30' : 'border-[#a3d9a8]'}`} title="护眼绿"></button>
                  </div>
                </div>

                <div className="flex items-center space-x-4">
                  <div className="flex items-center space-x-2">
                    <span className="text-xs text-slate-400">字号:</span>
                    <button onClick={() => setFontSize(Math.max(14, fontSize - 2))} className="px-2 py-1 rounded bg-slate-800 text-xs font-bold hover:bg-slate-700">A-</button>
                    <span className="text-xs font-mono">{fontSize}px</span>
                    <button onClick={() => setFontSize(Math.min(28, fontSize + 2))} className="px-2 py-1 rounded bg-slate-800 text-xs font-bold hover:bg-slate-700">A+</button>
                  </div>

                  <button
                    onClick={() => setIsAutoScrolling(!isAutoScrolling)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center space-x-1.5 transition-all ${
                      isAutoScrolling ? 'bg-rose-600 text-white animate-pulse' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                    }`}
                  >
                    {isAutoScrolling ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                    <span>{isAutoScrolling ? '停止滚动' : '自动滚动'}</span>
                  </button>
                </div>
              </div>

              {/* Status Header Verification */}
              {hasFullEnding && (
                <div className="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 flex items-center justify-between text-xs">
                  <div className="flex items-center space-x-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>正文已由官方解密引擎完整加载，包含大结局全文完 ({chapterWordCount} 字)。</span>
                  </div>
                  <span className="font-mono bg-emerald-500/20 px-2 py-0.5 rounded text-emerald-200">未截断</span>
                </div>
              )}

              {/* Chapter Content Card */}
              <div className={`rounded-3xl border p-8 md:p-12 shadow-2xl transition-colors duration-300 ${readerThemeClasses}`}>
                {loadingChapter ? (
                  <div className="py-24 flex flex-col items-center justify-center space-y-4">
                    <RefreshCw className="w-8 h-8 animate-spin text-rose-500" />
                    <p className="text-sm text-slate-400">正在官方API解密加载章节正文...</p>
                  </div>
                ) : (
                  <div className="space-y-8">
                    <div className="border-b border-current pb-6 opacity-80">
                      <h2 className="text-2xl md:text-3xl font-bold tracking-tight">{chapterTitle}</h2>
                      <p className="text-xs mt-1 font-mono opacity-60">《{novelInfo?.title || '番茄小说'}》 · 作者：{novelInfo?.author} · {chapterWordCount} 字</p>
                    </div>

                    <div 
                      className="space-y-6 font-serif leading-relaxed whitespace-pre-wrap"
                      style={{ fontSize: `${fontSize}px`, lineHeight: lineHeight }}
                    >
                      {chapterContent || '暂无章节内容，请在目录中选择章节。'}
                    </div>

                    {/* Chapter Navigation Buttons */}
                    <div className="pt-12 border-t border-current flex items-center justify-between opacity-90">
                      <button
                        onClick={() => {
                          if (!novelInfo || !currentChapterId) return;
                          const idx = novelInfo.chapters.findIndex(c => c.id === currentChapterId);
                          if (idx > 0) {
                            loadChapter(novelInfo.chapters[idx - 1].id, novelInfo.chapters[idx - 1].title, novelInfo.id);
                          }
                        }}
                        className="px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold flex items-center space-x-2 shadow-md transition-all"
                      >
                        <ChevronLeft className="w-4 h-4" />
                        <span>上一章</span>
                      </button>

                      <button
                        onClick={() => {
                          if (!novelInfo || !currentChapterId) return;
                          const idx = novelInfo.chapters.findIndex(c => c.id === currentChapterId);
                          if (idx >= 0 && idx < novelInfo.chapters.length - 1) {
                            loadChapter(novelInfo.chapters[idx + 1].id, novelInfo.chapters[idx + 1].title, novelInfo.id);
                          }
                        }}
                        className="px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold flex items-center space-x-2 shadow-md transition-all"
                      >
                        <span>下一章</span>
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {/* TAB 3: GEMINI AI COMPANION */}
          {activeTab === 'ai' && (
            <motion.div
              key="ai"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-6 max-w-4xl mx-auto"
            >
              <div className="rounded-3xl bg-slate-900 border border-slate-800 p-8 space-y-6 shadow-xl relative overflow-hidden">
                <div className="absolute right-0 top-0 w-80 h-80 bg-gradient-to-bl from-rose-500/10 to-amber-500/10 rounded-full blur-3xl pointer-events-none"></div>
                <div className="flex items-center space-x-3">
                  <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-rose-600 to-amber-600 flex items-center justify-center shadow-lg shadow-rose-600/30">
                    <Sparkles className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h3 className="text-2xl font-bold">Gemini AI 智能伴读与小说拆解</h3>
                    <p className="text-xs text-slate-400">基于 Google Gemini 2.5 Flash 提供深度文学分析、角色关系和剧情问答</p>
                  </div>
                </div>

                {/* AI Mode Selectors */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <button
                    onClick={() => { setAiMode('summary'); runAiAnalysis('summary'); }}
                    className={`p-4 rounded-2xl border text-left transition-all ${
                      aiMode === 'summary' ? 'bg-rose-600/20 border-rose-500 text-white' : 'bg-slate-950/40 border-slate-800 text-slate-400 hover:border-slate-700'
                    }`}
                  >
                    <h4 className="font-bold text-sm text-white">📖 全文剧情拆解与看点</h4>
                    <p className="text-xs text-slate-400 mt-1">一键剖析全篇剧情主线、高潮转折与大结局</p>
                  </button>

                  <button
                    onClick={() => { setAiMode('characters'); runAiAnalysis('characters'); }}
                    className={`p-4 rounded-2xl border text-left transition-all ${
                      aiMode === 'characters' ? 'bg-rose-600/20 border-rose-500 text-white' : 'bg-slate-950/40 border-slate-800 text-slate-400 hover:border-slate-700'
                    }`}
                  >
                    <h4 className="font-bold text-sm text-white">👥 人物群像与博弈</h4>
                    <p className="text-xs text-slate-400 mt-1">深度剖析人物性格、命运和冲突关系</p>
                  </button>

                  <button
                    onClick={() => { setAiMode('qa'); }}
                    className={`p-4 rounded-2xl border text-left transition-all ${
                      aiMode === 'qa' ? 'bg-rose-600/20 border-rose-500 text-white' : 'bg-slate-950/40 border-slate-800 text-slate-400 hover:border-slate-700'
                    }`}
                  >
                    <h4 className="font-bold text-sm text-white">💬 剧情深度问答</h4>
                    <p className="text-xs text-slate-400 mt-1">输入任何关于小说细节、伏笔与结局的疑问</p>
                  </button>
                </div>

                {aiMode === 'qa' && (
                  <div className="flex gap-3">
                    <input
                      type="text"
                      value={aiPrompt}
                      onChange={(e) => setAiPrompt(e.target.value)}
                      placeholder="例如：男主角裴霁的真实身份与最后结局是什么？"
                      className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-rose-500"
                    />
                    <button
                      onClick={() => runAiAnalysis('qa')}
                      disabled={aiLoading}
                      className="px-6 py-3 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-semibold text-sm flex items-center space-x-2 shadow-lg shadow-rose-600/30 transition-all disabled:opacity-50"
                    >
                      <Cpu className="w-4 h-4" />
                      <span>{aiLoading ? '思考中...' : '向AI提问'}</span>
                    </button>
                  </div>
                )}

                {/* AI Output Result Box */}
                <div className="rounded-2xl bg-slate-950 border border-slate-800 p-6 space-y-3 min-h-[250px] shadow-inner">
                  <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
                    <span className="text-xs font-semibold text-rose-400 uppercase tracking-wider flex items-center space-x-2">
                      <Sparkles className="w-4 h-4" />
                      <span>Gemini 分析报告</span>
                    </span>
                    {aiLoading && <span className="text-xs text-slate-400 animate-pulse">Gemini 正在深度推演中...</span>}
                  </div>

                  <div className="text-sm text-slate-200 leading-relaxed font-sans whitespace-pre-wrap">
                    {aiResult || (aiLoading ? 'AI 正在深入分析全篇小说，请稍候...' : '点击上方卡片选择分析模式，或输入您的问题。')}
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {/* TAB 4: LOCAL SHELF */}
          {activeTab === 'shelf' && (
            <motion.div
              key="shelf"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-6"
            >
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-2xl font-bold">本地书架与历史记录</h3>
                  <p className="text-xs text-slate-400">您最近解析和下载过的小说列表</p>
                </div>
                <button
                  onClick={() => { setDownloadedBooks([]); localStorage.removeItem('fanqie_shelf'); }}
                  className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-rose-950/30 text-rose-400 border border-rose-500/20 text-xs font-semibold flex items-center space-x-2 transition-all"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>清空书架记录</span>
                </button>
              </div>

              {downloadedBooks.length === 0 ? (
                <div className="rounded-3xl bg-slate-900 border border-slate-800 p-16 text-center space-y-4">
                  <Bookmark className="w-12 h-12 text-slate-600 mx-auto" />
                  <p className="text-slate-400 text-sm">书架暂无小说，快去下载与探索吧！</p>
                  <button
                    onClick={() => setActiveTab('downloader')}
                    className="px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold transition-all shadow-lg shadow-rose-600/30"
                  >
                    去搜索小说
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {downloadedBooks.map((book) => (
                    <div 
                      key={book.id}
                      className="rounded-3xl bg-slate-900 border border-slate-800 p-6 space-y-4 shadow-xl hover:border-slate-700 transition-all flex flex-col justify-between"
                    >
                      <div className="flex space-x-4">
                        <div className="w-20 h-28 rounded-xl bg-slate-800 overflow-hidden shrink-0 shadow border border-slate-700">
                          {book.cover ? (
                            <img src={book.cover} alt={book.title} className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center bg-rose-900/40 text-rose-300 font-bold text-xl">
                              {book.title[0]}
                            </div>
                          )}
                        </div>
                        <div className="space-y-1.5 flex-1">
                          <h4 className="font-bold text-white text-base line-clamp-1">{book.title}</h4>
                          <p className="text-xs text-slate-400 font-medium">{book.author}</p>
                          <p className="text-xs text-emerald-400 font-semibold">{book.totalChapters} 章</p>
                          <p className="text-xs text-slate-500 line-clamp-2 mt-1">{book.description}</p>
                        </div>
                      </div>

                      <div className="flex items-center space-x-2 pt-2 border-t border-slate-800">
                        <button
                          onClick={() => {
                            setNovelInfo(book);
                            if (book.chapters.length > 0) {
                              loadChapter(book.chapters[0].id, book.chapters[0].title, book.id);
                              setActiveTab('reader');
                            }
                          }}
                          className="flex-1 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold flex items-center justify-center space-x-1.5 transition-all shadow"
                        >
                          <BookOpen className="w-3.5 h-3.5" />
                          <span>继续阅读</span>
                        </button>
                        <button
                          onClick={() => {
                            setNovelIdInput(book.id);
                            fetchNovelInfo(book.id);
                            setActiveTab('downloader');
                          }}
                          className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition-all border border-slate-700"
                        >
                          查看目录
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-900 bg-slate-950 py-6 px-6 text-center text-xs text-slate-500 space-y-1">
        <p>Fanqie Novel Downloader & AI Studio Suite · Powered by Node.js, Tomato Engine & Google Gemini 2.5</p>
        <p className="text-slate-600">本工具仅供学习交流与研究使用，请勿用于任何商业或侵权行为。</p>
      </footer>
    </div>
  );
}
