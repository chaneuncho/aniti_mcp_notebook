const express = require('express');
const cors = require('cors');
const axios = require('axios');
const cheerio = require('cheerio');
const { execFile } = require('child_process');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// nlm CLI 실행 헬퍼
function executeNlm(args, options = {}) {
  return new Promise((resolve, reject) => {
    // Windows 사용자 로컬 경로 또는 환경변수 PATH의 nlm.exe
    const nlmPath = process.env.NLM_PATH || 'nlm';
    execFile(nlmPath, args, { shell: true, timeout: 60000, ...options }, (error, stdout, stderr) => {
      if (error) {
        return reject({
          error,
          stderr: (stderr || '').trim(),
          stdout: (stdout || '').trim(),
        });
      }
      resolve((stdout || '').trim());
    });
  });
}

// Daum 뉴스 스크래핑 함수
async function fetchDaumTop5News() {
  const targetUrl = 'https://news.daum.net/';
  
  const response = await axios.get(targetUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
    },
    timeout: 7000,
  });

  const $ = cheerio.load(response.data);
  const newsList = [];
  const seenUrls = new Set();

  $('.box_news_headline2 .list_newsheadline2 li, .list_newsheadline2 li').each((_, el) => {
    if (newsList.length >= 5) return false;

    const $el = $(el);
    const $link = $el.find('a.item_newsheadline2');
    if (!$link.length) return;

    let url = $link.attr('href') || '';
    if (!url.startsWith('http')) {
      url = 'https:' + url;
    }

    if (seenUrls.has(url)) return;

    const title = $link.find('.tit_txt').text().trim() || $link.text().trim();
    const desc = $link.find('.desc_txt').text().trim();
    
    let thumb = $link.find('picture source').first().attr('srcset') ||
                $link.find('picture img').attr('src') ||
                $link.find('img').attr('src') || '';
    
    if (thumb) {
      thumb = thumb.split(' ')[0].trim();
      if (thumb.startsWith('//')) {
        thumb = 'https:' + thumb;
      }
    }

    const infoItems = $link.find('.txt_info').map((_, item) => $(item).text().trim()).get();
    const media = infoItems[0] || '다음뉴스';
    const time = infoItems[1] || '';

    if (title) {
      seenUrls.add(url);
      newsList.push({
        rank: newsList.length + 1,
        title,
        desc,
        url,
        thumb,
        media,
        time,
        category: '주요뉴스'
      });
    }
  });

  if (newsList.length < 5) {
    $('a[href*="v.daum.net/v/"]').each((_, el) => {
      if (newsList.length >= 5) return false;
      const $a = $(el);
      let url = $a.attr('href') || '';
      if (!url.startsWith('http')) url = 'https:' + url;
      if (seenUrls.has(url)) return;

      const title = $a.text().trim();
      if (title.length < 10) return;

      seenUrls.add(url);
      newsList.push({
        rank: newsList.length + 1,
        title,
        desc: '',
        url,
        thumb: '',
        media: '다음뉴스',
        time: '실시간',
        category: '속보'
      });
    });
  }

  return newsList.slice(0, 5);
}

// 1. 뉴스 데이터 조회 API
app.get('/api/news/top5', async (req, res) => {
  try {
    const news = await fetchDaumTop5News();
    res.json({
      success: true,
      updatedAt: new Date().toISOString(),
      count: news.length,
      data: news,
    });
  } catch (error) {
    console.error('Error fetching Daum news:', error.message);
    res.status(500).json({
      success: false,
      message: '다음 뉴스 크롤링 중 오류가 발생했습니다.',
      error: error.message,
    });
  }
});

// 2. NotebookLM 상태 확인 API
app.get('/api/notebooklm/status', async (req, res) => {
  try {
    const output = await executeNlm(['doctor']);
    const isAuthExpired = output.includes('Authentication expired') || output.includes('run \'nlm login\'');
    const hasCookies = output.includes('Cookies: present');

    res.json({
      success: true,
      authenticated: hasCookies && !isAuthExpired,
      output,
    });
  } catch (err) {
    const errOutput = err.stderr || err.stdout || (err.error && err.error.message) || '';
    const isAuthExpired = errOutput.includes('Authentication expired') || errOutput.includes('nlm login');
    res.json({
      success: false,
      authenticated: false,
      isAuthExpired,
      message: isAuthExpired
        ? 'NotebookLM 로그인 인증이 만료되었습니다. 터미널에서 nlm login을 실행해주세요.'
        : 'NotebookLM 상태 확인 실패',
      details: errOutput,
    });
  }
});

// 3. NotebookLM 노트북 목록 조회 API
app.get('/api/notebooklm/notebooks', async (req, res) => {
  try {
    const output = await executeNlm(['notebook', 'list', '--json']);
    let notebooks = [];
    try {
      notebooks = JSON.parse(output);
    } catch {
      // JSON 파싱 실패 시 텍스트 파싱
      notebooks = [];
    }
    res.json({
      success: true,
      notebooks,
    });
  } catch (err) {
    const msg = err.stderr || err.stdout || (err.error && err.error.message);
    res.status(500).json({
      success: false,
      message: '노트북 목록을 불러오지 못했습니다.',
      error: msg,
      needLogin: msg.includes('nlm login') || msg.includes('Authentication expired'),
    });
  }
});

// 4. 단일 뉴스 기사를 NotebookLM에 등록 API
app.post('/api/notebooklm/register-single', async (req, res) => {
  const { title, url, desc, media, notebookId } = req.body;

  if (!url) {
    return res.status(400).json({ success: false, message: '기사 URL이 필요합니다.' });
  }

  try {
    let targetNotebookId = notebookId;
    let createdNewNotebook = false;

    // 노트북 ID가 없으면 새 노트북 자동 생성
    if (!targetNotebookId) {
      const cleanTitle = (title || 'Daum 뉴스').replace(/["']/g, '');
      const notebookTitle = `[Daum 뉴스] ${cleanTitle.slice(0, 30)}`;
      const createOutput = await executeNlm(['notebook', 'create', `"${notebookTitle}"`, '--json']);
      createdNewNotebook = true;
      try {
        const parsed = JSON.parse(createOutput);
        targetNotebookId = parsed.id || parsed.notebook_id;
      } catch {
        // ID 추출 정규식
        const match = createOutput.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
        if (match) targetNotebookId = match[0];
      }
    }

    if (!targetNotebookId) {
      throw new Error('노트북을 생성하거나 식별할 수 없습니다.');
    }

    // 소스(URL) 등록
    const addArgs = ['source', 'add', targetNotebookId, '--url', `"${url}"`];
    await executeNlm(addArgs);

    // 요약 메모(노트)도 등록 (있을 경우)
    if (desc) {
      const noteContent = `제목: ${title}\n언론사: ${media || '미상'}\n원문 링크: ${url}\n\n[주요 요약]\n${desc}`;
      try {
        await executeNlm(['note', 'create', targetNotebookId, '--title', `"${title.slice(0, 20)} 요약"`, '--content', `"${noteContent}"`]);
      } catch (e) {
        console.warn('Note creation warning:', e.stderr || e.stdout);
      }
    }

    res.json({
      success: true,
      notebookId: targetNotebookId,
      createdNewNotebook,
      notebookUrl: `https://notebooklm.google.com/notebook/${targetNotebookId}`,
      message: `NotebookLM에 기사가 등록되었습니다!`,
    });
  } catch (err) {
    console.error('Error registering to NotebookLM:', err);
    const msg = err.stderr || err.stdout || (err.error && err.error.message) || '';
    const needLogin = msg.includes('nlm login') || msg.includes('Authentication expired');

    res.status(500).json({
      success: false,
      message: needLogin
        ? 'NotebookLM 인증이 만료되었습니다. 터미널에서 nlm login을 실행하여 로그인해주세요.'
        : 'NotebookLM 등록 중 오류가 발생했습니다.',
      needLogin,
      details: msg,
    });
  }
});

// 5. 오늘 TOP 5 뉴스 전체를 NotebookLM에 일괄 등록 API
app.post('/api/notebooklm/register-top5', async (req, res) => {
  const { newsList, customTitle } = req.body;

  if (!Array.isArray(newsList) || newsList.length === 0) {
    return res.status(400).json({ success: false, message: '등록할 뉴스 목록이 없습니다.' });
  }

  try {
    const today = new Date().toISOString().slice(0, 10);
    const notebookTitle = customTitle || `[Daum 뉴스] ${today} 오늘의 TOP 5 뉴스 브리핑`;

    // 1. 새 노트북 생성
    const createOutput = await executeNlm(['notebook', 'create', `"${notebookTitle}"`, '--json']);
    let notebookId = null;

    try {
      const parsed = JSON.parse(createOutput);
      notebookId = parsed.id || parsed.notebook_id;
    } catch {
      const match = createOutput.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
      if (match) notebookId = match[0];
    }

    if (!notebookId) {
      throw new Error('노트북을 생성할 수 없습니다.');
    }

    // 2. 5개 뉴스 기사 URL을 소스로 추가
    const urlArgs = ['source', 'add', notebookId];
    newsList.forEach(item => {
      if (item.url) {
        urlArgs.push('--url', `"${item.url}"`);
      }
    });

    await executeNlm(urlArgs);

    // 3. 전체 TOP 5 요약 정리 노트 생성
    let summaryNote = `📅 일자: ${today}\n📰 출처: Daum 뉴스 메인\n\n=== 오늘의 주요 TOP 5 뉴스 요약 ===\n\n`;
    newsList.forEach(item => {
      summaryNote += `[${item.rank}위] ${item.title}\n- 언론사: ${item.media} (${item.time || ''})\n- 링크: ${item.url}\n`;
      if (item.desc) {
        summaryNote += `- 요약: ${item.desc}\n`;
      }
      summaryNote += '\n';
    });

    try {
      await executeNlm(['note', 'create', notebookId, '--title', `"오늘의 TOP 5 브리핑 요약"`, '--content', `"${summaryNote}"`]);
    } catch (e) {
      console.warn('Top 5 note warning:', e.stderr || e.stdout);
    }

    res.json({
      success: true,
      notebookId,
      notebookTitle,
      sourcesCount: newsList.length,
      notebookUrl: `https://notebooklm.google.com/notebook/${notebookId}`,
      message: `오늘의 TOP 5 뉴스가 NotebookLM 새 노트북에 등록되었습니다!`,
    });
  } catch (err) {
    console.error('Error batch registering to NotebookLM:', err);
    const msg = err.stderr || err.stdout || (err.error && err.error.message) || '';
    const needLogin = msg.includes('nlm login') || msg.includes('Authentication expired');

    res.status(500).json({
      success: false,
      message: needLogin
        ? 'NotebookLM 인증이 만료되었습니다. 터미널에서 nlm login을 실행해주세요.'
        : 'NotebookLM 일괄 등록 중 오류가 발생했습니다.',
      needLogin,
      details: msg,
    });
  }
});

// 캐시 변수
let cachedSummary = null;
let lastSummaryTime = null;
let isGeneratingSummary = false;

// 트렌드 요약 조회 API
app.get('/api/notebooklm/trend-summary', async (req, res) => {
  // 캐시가 유효하면 (최근 15분 이내) 캐시 반환
  if (cachedSummary && lastSummaryTime && (Date.now() - lastSummaryTime < 15 * 60 * 1000)) {
    return res.json({
      success: true,
      fromCache: true,
      updatedAt: new Date(lastSummaryTime).toISOString(),
      summary: cachedSummary,
    });
  }

  try {
    // 1. 최신 [Daum 뉴스] 노트북 검색
    const listOutput = await executeNlm(['notebook', 'list', '--json']);
    let notebooks = [];
    try {
      notebooks = JSON.parse(listOutput);
    } catch {
      notebooks = [];
    }

    const daumNotebook = notebooks.find(nb => nb.title && nb.title.includes('Daum 뉴스'));

    let targetNotebookId = daumNotebook ? daumNotebook.id : null;

    // 만약 노트북이 없거나 소스가 0개면 새로 생성하고 크롤링한 뉴스 등록
    if (!targetNotebookId || daumNotebook.source_count === 0) {
      const news = await fetchDaumTop5News();
      const today = new Date().toISOString().slice(0, 10);
      const nbTitle = `[Daum 뉴스] ${today} 오늘의 TOP 5 뉴스 브리핑`;
      const createOutput = await executeNlm(['notebook', 'create', `"${nbTitle}"`, '--json']);
      try {
        const p = JSON.parse(createOutput);
        targetNotebookId = p.id || p.notebook_id;
      } catch {
        const m = createOutput.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
        if (m) targetNotebookId = m[0];
      }

      if (targetNotebookId && news.length > 0) {
        const urlArgs = ['source', 'add', targetNotebookId];
        news.forEach(n => {
          if (n.url) urlArgs.push('--url', `"${n.url}"`);
        });
        await executeNlm(urlArgs);
      }
    }

    if (!targetNotebookId) {
      throw new Error('NotebookLM 노트북을 찾을 수 없습니다.');
    }

    // 2. nlm query 실행
    const queryPrompt = "오늘 등록된 주요 뉴스 5건을 분석하여 오늘의 핵심 트렌드 요약과 시사점을 한국어로 일목요연하고 가독성 좋게 정리해줘.";
    const queryOutput = await executeNlm([
      'query',
      'notebook',
      targetNotebookId,
      `"${queryPrompt}"`,
      '--json'
    ], { timeout: 120000 });

    let answerText = queryOutput;
    try {
      const parsed = JSON.parse(queryOutput);
      answerText = parsed.answer || queryOutput;
    } catch {
      // 텍스트 그대로 사용
    }

    cachedSummary = answerText;
    lastSummaryTime = Date.now();

    res.json({
      success: true,
      fromCache: false,
      notebookId: targetNotebookId,
      notebookUrl: `https://notebooklm.google.com/notebook/${targetNotebookId}`,
      updatedAt: new Date(lastSummaryTime).toISOString(),
      summary: answerText,
    });
  } catch (err) {
    console.error('Error generating trend summary:', err);
    const msg = err.stderr || err.stdout || (err.error && err.error.message) || '';
    
    // 만약 에러지만 이전 캐시가 있다면 이전 캐시 반환
    if (cachedSummary) {
      return res.json({
        success: true,
        fromCache: true,
        warning: '새 요약 생성 중 오류로 이전 캐시를 표시합니다.',
        summary: cachedSummary,
        updatedAt: new Date(lastSummaryTime).toISOString(),
      });
    }

    res.status(500).json({
      success: false,
      message: 'NotebookLM 트렌드 요약을 불러오지 못했습니다.',
      error: msg,
      needLogin: msg.includes('nlm login') || msg.includes('Authentication expired'),
    });
  }
});

// 강제 새로고침 API
app.post('/api/notebooklm/trend-summary/refresh', async (req, res) => {
  cachedSummary = null;
  lastSummaryTime = null;
  res.redirect(307, '/api/notebooklm/trend-summary');
});

// 헬스체크
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', serverTime: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`[Daum News Server] running on http://localhost:${PORT}`);
});
