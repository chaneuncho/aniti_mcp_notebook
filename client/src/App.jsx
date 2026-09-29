import React, { useState, useEffect, useCallback } from 'react';
import './App.css';
import {
  Newspaper,
  Flame,
  RefreshCw,
  Sun,
  Moon,
  ExternalLink,
  Share2,
  Search,
  Clock,
  Sparkles,
  CheckCircle,
  AlertCircle,
  TrendingUp,
  BookOpen,
  ChevronDown,
  ChevronUp,
  X,
  Bot,
  Timer,
} from 'lucide-react';

export default function App() {
  const [news, setNews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'dark');
  const [searchQuery, setSearchQuery] = useState('');
  const [lastUpdated, setLastUpdated] = useState(null);
  const [toastMessage, setToastMessage] = useState(null);

  // NotebookLM 상태 관리
  const [isRegistering, setIsRegistering] = useState(false);
  const [registerStatus, setRegisterStatus] = useState(null); // { success, message, url, title, needLogin }

  // 종합 트렌드 요약 상태
  const [trendSummary, setTrendSummary] = useState(null);
  const [trendLoading, setTrendLoading] = useState(true);
  const [trendError, setTrendError] = useState(null);
  const [trendNotebookUrl, setTrendNotebookUrl] = useState(null);
  const [isSummaryExpanded, setIsSummaryExpanded] = useState(true);

  // 자동 갱신 설정 (기본값: 10분)
  const [autoRefreshInterval, setAutoRefreshInterval] = useState(() => {
    const saved = localStorage.getItem('autoRefreshInterval');
    return saved !== null ? parseInt(saved, 10) : 10;
  });
  const [timeLeft, setTimeLeft] = useState(autoRefreshInterval * 60);

  // 테마 적용
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  // 자동 갱신 주기 저장
  const handleIntervalChange = (newInterval) => {
    const min = parseInt(newInterval, 10);
    setAutoRefreshInterval(min);
    localStorage.setItem('autoRefreshInterval', min.toString());
    setTimeLeft(min * 60);
    if (min > 0) {
      showToast(`자동 갱신 주기가 ${min}분으로 설정되었습니다.`);
    } else {
      showToast('자동 갱신이 비활성화되었습니다.');
    }
  };

  const toggleTheme = () => {
    setTheme(prev => (prev === 'dark' ? 'light' : 'dark'));
  };

  // 뉴스 데이터 가져오기
  const fetchTop5News = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/news/top5');
      if (!response.ok) {
        throw new Error(`서버 응답 오류 (상태 코드: ${response.status})`);
      }
      const data = await response.json();
      if (data.success && Array.isArray(data.data)) {
        setNews(data.data);
        setLastUpdated(new Date());
      } else {
        throw new Error(data.message || '데이터를 불러오지 못했습니다.');
      }
    } catch (err) {
      console.error('Fetch News Error:', err);
      setError(err.message || '뉴스 데이터를 가져오는 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  }, []);

  // NotebookLM 종합 트렌드 요약 가져오기
  const fetchTrendSummary = useCallback(async (forceRefresh = false) => {
    setTrendLoading(true);
    setTrendError(null);
    try {
      const endpoint = forceRefresh ? '/api/notebooklm/trend-summary/refresh' : '/api/notebooklm/trend-summary';
      const method = forceRefresh ? 'POST' : 'GET';
      const response = await fetch(endpoint, { method });
      const data = await response.json();

      if (data.success && data.summary) {
        setTrendSummary(data.summary);
        if (data.notebookUrl) {
          setTrendNotebookUrl(data.notebookUrl);
        }
      } else {
        throw new Error(data.message || '요약 데이터를 가져올 수 없습니다.');
      }
    } catch (err) {
      console.error('Trend Summary Error:', err);
      setTrendError(err.message || '트렌드 요약을 불러오지 못했습니다.');
    } finally {
      setTrendLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTop5News();
    fetchTrendSummary();
  }, [fetchTop5News, fetchTrendSummary]);

  // 자동 갱신 카운트다운 타이머
  useEffect(() => {
    if (autoRefreshInterval <= 0) return;

    const timer = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          // 타이머 만료 -> 자동 갱신 트리거
          fetchTop5News();
          fetchTrendSummary(false);
          showToast(`[자동 갱신] ${autoRefreshInterval}분 주기에 따라 뉴스를 최신으로 갱신했습니다.`);
          return autoRefreshInterval * 60;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [autoRefreshInterval, fetchTop5News, fetchTrendSummary]);

  // 남은 시간 포맷팅 (MM:SS)
  const formatTimeLeft = (seconds) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  // 링크 복사 핸들러
  const handleCopyLink = (url, title) => {
    navigator.clipboard.writeText(url).then(() => {
      showToast(`'${title.slice(0, 18)}...' 링크가 복사되었습니다!`);
    }).catch(() => {
      showToast('링크 복사에 실패했습니다.');
    });
  };

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 3000);
  };

  // 단일 뉴스 NotebookLM 등록 핸들러
  const handleRegisterSingle = async (item) => {
    setIsRegistering(true);
    try {
      const res = await fetch('/api/notebooklm/register-single', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: item.title,
          url: item.url,
          desc: item.desc,
          media: item.media,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setRegisterStatus({
          success: true,
          title: item.title,
          url: data.notebookUrl,
          message: `'${item.title.slice(0, 25)}...' 기사가 NotebookLM에 등록되었습니다.`,
        });
      } else {
        setRegisterStatus({
          success: false,
          needLogin: data.needLogin,
          message: data.message || '등록에 실패했습니다.',
          details: data.details,
        });
      }
    } catch (err) {
      setRegisterStatus({
        success: false,
        message: '서버와 통신하는 중 오류가 발생했습니다.',
        details: err.message,
      });
    } finally {
      setIsRegistering(false);
    }
  };

  // TOP 5 전체 뉴스 일괄 NotebookLM 등록 핸들러
  const handleRegisterTop5 = async () => {
    if (news.length === 0) return;
    setIsRegistering(true);
    try {
      const res = await fetch('/api/notebooklm/register-top5', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          newsList: news,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setRegisterStatus({
          success: true,
          title: data.notebookTitle,
          url: data.notebookUrl,
          message: `오늘의 TOP 5 뉴스 기사 ${data.sourcesCount}건과 요약 노트가 NotebookLM에 모두 등록되었습니다!`,
        });
        // 일괄 등록 후 트렌드 요약도 최신으로 갱신
        fetchTrendSummary(true);
      } else {
        setRegisterStatus({
          success: false,
          needLogin: data.needLogin,
          message: data.message || '일괄 등록에 실패했습니다.',
          details: data.details,
        });
      }
    } catch (err) {
      setRegisterStatus({
        success: false,
        message: '서버와 통신하는 중 오류가 발생했습니다.',
        details: err.message,
      });
    } finally {
      setIsRegistering(false);
    }
  };

  // 검색 필터링
  const filteredNews = news.filter(item => {
    const query = searchQuery.toLowerCase().trim();
    if (!query) return true;
    return (
      item.title.toLowerCase().includes(query) ||
      (item.desc && item.desc.toLowerCase().includes(query)) ||
      (item.media && item.media.toLowerCase().includes(query))
    );
  });

  const heroNews = filteredNews.length > 0 ? filteredNews[0] : null;
  const secondaryNews = filteredNews.length > 1 ? filteredNews.slice(1) : [];

  // 날짜 포맷
  const todayFormatted = new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  }).format(new Date());

  return (
    <div className="app-container">
      {/* 헤더 섹션 */}
      <header className="header-wrapper animate-fade-in">
        <div className="header-top">
          <div className="logo-section">
            <div className="daum-badge">
              <span className="live-dot"></span>
              LIVE DAUM
            </div>
            <h1 className="title-main">
              <Flame size={28} color="#f59e0b" />
              오늘의 Daum TOP 5 뉴스
            </h1>
          </div>

          <div className="header-actions">
            {/* 자동 갱신 설정 컨트롤 (기본 10분) */}
            <div className="auto-refresh-wrapper" title="자동 갱신 주기 설정 (기본: 10분)">
              <Timer size={15} color="#818cf8" />
              <select
                id="auto-refresh-select"
                className="auto-refresh-select"
                value={autoRefreshInterval}
                onChange={(e) => handleIntervalChange(e.target.value)}
              >
                <option value="1">1분</option>
                <option value="3">3분</option>
                <option value="5">5분</option>
                <option value="10">10분 (기본)</option>
                <option value="15">15분</option>
                <option value="30">30분</option>
                <option value="60">60분</option>
                <option value="0">자동 갱신 끔</option>
              </select>

              {autoRefreshInterval > 0 && (
                <span className="countdown-badge" title="다음 자동 갱신까지 남은 시간">
                  {formatTimeLeft(timeLeft)}
                </span>
              )}
            </div>

            {/* NotebookLM TOP 5 전체 일괄 등록 버튼 */}
            <button
              id="notebooklm-all-btn"
              onClick={handleRegisterTop5}
              disabled={isRegistering || news.length === 0}
              className="btn-icon btn-notebooklm"
              title="오늘 TOP 5 뉴스를 NotebookLM 새 노트북에 일괄 등록"
            >
              <BookOpen size={16} />
              <span>NotebookLM 일괄 등록</span>
            </button>

            <button
              id="refresh-btn"
              onClick={() => {
                fetchTop5News();
                fetchTrendSummary(false);
                setTimeLeft(autoRefreshInterval * 60);
              }}
              disabled={loading || isRegistering}
              className="btn-icon btn-refresh"
              title="최신 뉴스로 즉시 새로고침"
            >
              <RefreshCw size={16} className={loading ? 'spin-animation' : ''} />
              <span>새로고침</span>
            </button>

            <button
              id="theme-toggle-btn"
              onClick={toggleTheme}
              className="btn-icon"
              title={theme === 'dark' ? '라이트 모드로 전환' : '다크 모드로 전환'}
            >
              {theme === 'dark' ? <Sun size={17} color="#f59e0b" /> : <Moon size={17} color="#6366f1" />}
              <span>{theme === 'dark' ? '라이트' : '다크'}</span>
            </button>
          </div>
        </div>

        <div className="header-bottom">
          <div className="date-status">
            <Clock size={15} />
            <span>{todayFormatted}</span>
            {lastUpdated && (
              <span style={{ opacity: 0.75 }}>
                • 뉴스 갱신: {lastUpdated.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </span>
            )}
          </div>

          <div className="search-box">
            <Search size={15} className="search-icon" />
            <input
              type="text"
              id="news-search-input"
              className="search-input"
              placeholder="뉴스 검색 (키워드/언론사)"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>
      </header>

      {/* 🌟 최상단: Google NotebookLM 종합 트렌드 요약 섹션 */}
      <section className="trend-summary-wrapper animate-fade-in" id="trend-summary-section">
        <div className="trend-header">
          <div className="trend-badge-group">
            <div className="trend-badge">
              <Bot size={15} />
              <span>NotebookLM AI Analysis</span>
            </div>
            <h2 className="trend-title">
              <Sparkles size={22} color="#a855f7" />
              오늘의 종합 트렌드 요약
            </h2>
          </div>

          <div className="trend-actions">
            {trendNotebookUrl && (
              <a
                href={trendNotebookUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-link"
                style={{ background: 'rgba(139, 92, 246, 0.2)', color: '#c4b5fd', borderColor: 'rgba(139, 92, 246, 0.4)' }}
                title="Google NotebookLM에서 원문 노트북 열기"
              >
                <BookOpen size={13} style={{ marginRight: '4px' }} />
                NotebookLM 원문
                <ExternalLink size={12} style={{ marginLeft: '4px' }} />
              </a>
            )}

            <button
              onClick={() => fetchTrendSummary(true)}
              disabled={trendLoading}
              className="btn-link"
              title="NotebookLM AI 분석 재실행"
            >
              <RefreshCw size={13} className={trendLoading ? 'spin-animation' : ''} style={{ marginRight: '4px' }} />
              요약 재분석
            </button>

            <button
              onClick={() => setIsSummaryExpanded(prev => !prev)}
              className="btn-link"
              title={isSummaryExpanded ? '요약 접기' : '요약 펼치기'}
            >
              {isSummaryExpanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
            </button>
          </div>
        </div>

        {trendLoading && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', padding: '1rem 0' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', color: '#c4b5fd', fontSize: '0.9rem', marginBottom: '0.5rem' }}>
              <RefreshCw size={16} className="spin-animation" />
              <span>Google NotebookLM이 오늘 등록된 TOP 5 뉴스를 다각도로 심층 분석하고 있습니다...</span>
            </div>
            <div className="skeleton" style={{ height: '24px', width: '92%' }} />
            <div className="skeleton" style={{ height: '24px', width: '85%' }} />
            <div className="skeleton" style={{ height: '24px', width: '70%' }} />
          </div>
        )}

        {!trendLoading && trendError && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', color: '#f87171', padding: '0.5rem 0' }}>
            <AlertCircle size={20} />
            <span style={{ fontSize: '0.9rem' }}>{trendError}</span>
            <button onClick={() => fetchTrendSummary(true)} className="btn-link" style={{ marginLeft: 'auto' }}>
              다시 시도
            </button>
          </div>
        )}

        {!trendLoading && !trendError && trendSummary && isSummaryExpanded && (
          <div className="trend-content-box animate-fade-in">
            {trendSummary}
          </div>
        )}
      </section>

      {/* 에러 상태 */}
      {error && !loading && (
        <div className="empty-state animate-fade-in">
          <AlertCircle size={44} color="#ef4444" />
          <h3>뉴스를 가져오는 데 실패했습니다</h3>
          <p style={{ color: 'var(--text-muted)' }}>{error}</p>
          <button onClick={fetchTop5News} className="btn-icon btn-refresh" style={{ marginTop: '0.5rem' }}>
            <RefreshCw size={16} /> 다시 시도
          </button>
        </div>
      )}

      {/* 로딩 스켈레톤 */}
      {loading && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <div className="skeleton" style={{ height: '280px', width: '100%' }} />
          <div className="grid-cards">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="skeleton" style={{ height: '320px', width: '100%' }} />
            ))}
          </div>
        </div>
      )}

      {/* 정상 뉴스 목록 */}
      {!loading && !error && filteredNews.length > 0 && (
        <>
          {/* 1위 히어로 카드 */}
          {heroNews && (
            <div className="hero-card animate-fade-in">
              <div className="hero-thumb-wrapper">
                <span className="rank-pill rank-1">
                  <Sparkles size={14} /> TOP 1
                </span>
                {heroNews.thumb ? (
                  <img
                    src={heroNews.thumb}
                    alt={heroNews.title}
                    className="hero-thumb"
                    onError={(e) => {
                      e.target.onerror = null;
                      e.target.style.display = 'none';
                      e.target.parentNode.classList.add('thumb-placeholder');
                    }}
                  />
                ) : (
                  <div className="thumb-placeholder">
                    <Newspaper size={36} />
                    <span>Daum 뉴스 속보</span>
                  </div>
                )}
              </div>

              <div className="hero-content">
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.6rem' }}>
                    <span style={{ fontSize: '0.8rem', padding: '0.2rem 0.6rem', borderRadius: '4px', background: 'rgba(245, 158, 11, 0.15)', color: '#f59e0b', fontWeight: 700 }}>
                      오늘의 헤드라인 1위
                    </span>
                  </div>
                  <h2 className="hero-title">
                    <a href={heroNews.url} target="_blank" rel="noopener noreferrer">
                      {heroNews.title}
                    </a>
                  </h2>
                  {heroNews.desc && (
                    <p className="hero-desc" style={{ marginTop: '0.75rem' }}>
                      {heroNews.desc}
                    </p>
                  )}
                </div>

                <div className="card-meta">
                  <div className="meta-info">
                    <span className="media-badge">{heroNews.media}</span>
                    {heroNews.time && <span>• {heroNews.time}</span>}
                  </div>
                  <div className="action-links">
                    {/* NotebookLM 등록 버튼 */}
                    <button
                      className="btn-notebooklm-hero"
                      onClick={() => handleRegisterSingle(heroNews)}
                      disabled={isRegistering}
                      title="NotebookLM에 이 기사 등록"
                    >
                      <BookOpen size={14} />
                      <span>NotebookLM 등록</span>
                    </button>

                    <button
                      className="btn-link"
                      onClick={() => handleCopyLink(heroNews.url, heroNews.title)}
                      title="링크 복사"
                    >
                      <Share2 size={13} style={{ marginRight: '4px' }} />
                      복사
                    </button>
                    <a
                      href={heroNews.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn-link"
                      style={{ background: 'var(--accent-indigo)', color: '#fff', border: 'none' }}
                    >
                      기사 전문 <ExternalLink size={12} style={{ marginLeft: '4px' }} />
                    </a>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 2위 ~ 5위 카드 섹션 */}
          {secondaryNews.length > 0 && (
            <div style={{ marginTop: '1rem' }} className="animate-fade-in">
              <div className="section-title">
                <TrendingUp size={20} color="#60a5fa" />
                <span>주요 순위 (2위 ~ 5위)</span>
              </div>

              <div className="grid-cards">
                {secondaryNews.map((item) => {
                  const rankClass =
                    item.rank === 2
                      ? 'rank-2'
                      : item.rank === 3
                      ? 'rank-3'
                      : 'rank-other';

                  return (
                    <article key={item.url || item.rank} className="news-card">
                      <div className="card-thumb-wrapper">
                        <span className={`rank-pill ${rankClass}`}>
                          TOP {item.rank}
                        </span>
                        {item.thumb ? (
                          <img
                            src={item.thumb}
                            alt={item.title}
                            className="card-thumb"
                            onError={(e) => {
                              e.target.onerror = null;
                              e.target.style.display = 'none';
                              e.target.parentNode.classList.add('thumb-placeholder');
                            }}
                          />
                        ) : (
                          <div className="thumb-placeholder">
                            <Newspaper size={30} />
                            <span>Daum 뉴스</span>
                          </div>
                        )}
                      </div>

                      <h3 className="card-title">
                        <a href={item.url} target="_blank" rel="noopener noreferrer">
                          {item.title}
                        </a>
                      </h3>

                      {item.desc ? (
                        <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                          {item.desc}
                        </p>
                      ) : null}

                      <div className="card-meta">
                        <div className="meta-info">
                          <span className="media-badge">{item.media}</span>
                          {item.time && <span>• {item.time}</span>}
                        </div>
                        <div className="action-links">
                          {/* NotebookLM 등록 버튼 */}
                          <button
                            className="btn-notebooklm-card"
                            onClick={() => handleRegisterSingle(item)}
                            disabled={isRegistering}
                            title="NotebookLM에 등록"
                          >
                            <BookOpen size={12} />
                            <span>NLM</span>
                          </button>

                          <button
                            className="btn-link"
                            onClick={() => handleCopyLink(item.url, item.title)}
                            title="링크 복사"
                          >
                            <Share2 size={12} />
                          </button>
                          <a
                            href={item.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="btn-link"
                            title="원문 읽기"
                          >
                            <ExternalLink size={12} />
                          </a>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}

      {/* 검색 결과가 없을 때 */}
      {!loading && !error && filteredNews.length === 0 && (
        <div className="empty-state animate-fade-in">
          <Search size={40} color="var(--text-subtle)" />
          <h3>'{searchQuery}'에 대한 검색 결과가 없습니다</h3>
          <p style={{ color: 'var(--text-muted)' }}>다른 검색어를 입력해보세요.</p>
        </div>
      )}

      {/* 등록 중 오버레이 모달 */}
      {isRegistering && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ textAlign: 'center', alignItems: 'center' }}>
            <RefreshCw size={36} className="spin-animation" color="#10b981" />
            <h3 style={{ fontSize: '1.2rem' }}>NotebookLM에 등록 중입니다...</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
              notebooklm-mcp-cli를 통해 새 노트북 생성 및 소스를 동기화하고 있습니다.
            </p>
          </div>
        </div>
      )}

      {/* 등록 완료 또는 에러 모달 */}
      {registerStatus && (
        <div className="modal-overlay" onClick={() => setRegisterStatus(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div className="modal-header">
                {registerStatus.success ? (
                  <>
                    <CheckCircle size={26} color="#10b981" />
                    <span>NotebookLM 등록 완료</span>
                  </>
                ) : (
                  <>
                    <AlertCircle size={26} color="#ef4444" />
                    <span>등록 안내</span>
                  </>
                )}
              </div>
              <button
                onClick={() => setRegisterStatus(null)}
                style={{ color: 'var(--text-subtle)', padding: '0.2rem' }}
              >
                <X size={20} />
              </button>
            </div>

            <p style={{ fontSize: '0.95rem', lineHeight: '1.5', color: 'var(--text-main)' }}>
              {registerStatus.message}
            </p>

            {registerStatus.needLogin && (
              <div style={{
                background: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                padding: '0.85rem',
                borderRadius: '8px',
                fontSize: '0.85rem',
                color: '#f87171'
              }}>
                <strong>인증 필요:</strong> 터미널에서 <code>nlm login</code>을 실행하여 브라우저에서 Google 계정으로 로그인해주세요.
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
              {registerStatus.url && (
                <a
                  href={registerStatus.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-icon"
                  style={{ background: '#10b981', color: '#fff', border: 'none' }}
                >
                  <BookOpen size={16} />
                  <span>NotebookLM에서 열기</span>
                  <ExternalLink size={14} />
                </a>
              )}
              <button
                className="btn-icon"
                onClick={() => setRegisterStatus(null)}
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 푸터 */}
      <footer style={{
        marginTop: 'auto',
        paddingTop: '2rem',
        borderTop: '1px solid var(--border-color)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '1rem',
        fontSize: '0.825rem',
        color: 'var(--text-subtle)'
      }}>
        <div>
          데이터 출처: <a href="https://news.daum.net" target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'underline', color: '#60a5fa' }}>Daum 뉴스(news.daum.net)</a>
        </div>
        <div>
          Google NotebookLM AI Analysis &amp; Briefing
        </div>
      </footer>

      {/* 토스트 알림 */}
      {toastMessage && (
        <div className="toast">
          <CheckCircle size={17} color="#22c55e" />
          <span>{toastMessage}</span>
        </div>
      )}
    </div>
  );
}
