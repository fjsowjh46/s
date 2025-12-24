import { createContext, useContext, useState, useEffect, ReactNode, useCallback, useRef } from 'react';

interface BackgroundContextType {
  backgroundUrl: string;
  isLoaded: boolean;
  setLoaded: () => void;
  refreshBackground: () => void;
}

const BackgroundContext = createContext<BackgroundContextType | undefined>(undefined);

const BG_CACHE_KEY = 'app_background_cache';
const BG_EXPIRE_TIME = 24 * 60 * 60 * 1000; // 24小时过期
const BG_LOAD_TIMEOUT = 10000; // 10秒加载超时

interface BackgroundCache {
  url: string;
  timestamp: number;
}

// 全局单例状态,防止页面切换时重新加载
let globalBackgroundUrl: string | null = null;
let globalIsLoaded = false;

function getCachedBackground(): string | null {
  if (typeof window === 'undefined') return null;

  try {
    const cached = localStorage.getItem(BG_CACHE_KEY);
    if (!cached) return null;

    const data: BackgroundCache = JSON.parse(cached);
    const now = Date.now();

    if (now - data.timestamp > BG_EXPIRE_TIME) {
      localStorage.removeItem(BG_CACHE_KEY);
      return null;
    }

    return data.url;
  } catch {
    return null;
  }
}

function setCachedBackground(url: string): void {
  if (typeof window === 'undefined') return;

  try {
    const data: BackgroundCache = {
      url,
      timestamp: Date.now()
    };
    localStorage.setItem(BG_CACHE_KEY, JSON.stringify(data));
  } catch (error) {
    console.error('Failed to cache background:', error);
  }
}

function fetchNewBackground(): string {
  return `https://loliapi.com/acg/?${Date.now()}`;
}

// 预加载图片并验证
async function preloadImage(url: string): Promise<boolean> {
  return new Promise((resolve) => {
    const img = new Image();
    const timeout = setTimeout(() => {
      img.src = '';
      resolve(false);
    }, BG_LOAD_TIMEOUT);

    img.onload = () => {
      clearTimeout(timeout);
      resolve(true);
    };

    img.onerror = () => {
      clearTimeout(timeout);
      resolve(false);
    };

    img.src = url;
  });
}

export function BackgroundProvider({ children }: { children: ReactNode }) {
  const [backgroundUrl, setBackgroundUrl] = useState<string>(globalBackgroundUrl || '');
  const [isLoaded, setIsLoaded] = useState(globalIsLoaded);
  const isInitializing = useRef(false);

  useEffect(() => {
    // 如果全局已有背景,直接使用
    if (globalBackgroundUrl) {
      setBackgroundUrl(globalBackgroundUrl);
      setIsLoaded(globalIsLoaded);
      return;
    }

    // 防止重复初始化
    if (isInitializing.current) return;
    isInitializing.current = true;

    const initBackground = async () => {
      let finalUrl = '';

      // 先尝试使用缓存
      const cached = getCachedBackground();
      if (cached) {
        const isValid = await preloadImage(cached);
        if (isValid) {
          finalUrl = cached;
        } else {
          // 缓存的图片加载失败,清除缓存
          localStorage.removeItem(BG_CACHE_KEY);
        }
      }

      // 如果没有缓存或缓存失败,获取新图片
      if (!finalUrl) {
        const newUrl = fetchNewBackground();
        const isValid = await preloadImage(newUrl);
        if (isValid) {
          finalUrl = newUrl;
          setCachedBackground(newUrl);
        }
      }

      // 更新全局和组件状态
      if (finalUrl) {
        globalBackgroundUrl = finalUrl;
        setBackgroundUrl(finalUrl);
      }
    };

    initBackground();
  }, []);

  const setLoaded = useCallback(() => {
    globalIsLoaded = true;
    setIsLoaded(true);
  }, []);

  const refreshBackground = useCallback(async () => {
    const newUrl = fetchNewBackground();
    const isValid = await preloadImage(newUrl);

    if (isValid) {
      globalBackgroundUrl = newUrl;
      globalIsLoaded = false;
      setBackgroundUrl(newUrl);
      setCachedBackground(newUrl);
      setIsLoaded(false);
    }
  }, []);

  return (
    <BackgroundContext.Provider value={{ backgroundUrl, isLoaded, setLoaded, refreshBackground }}>
      {children}
    </BackgroundContext.Provider>
  );
}

export function useBackground() {
  const context = useContext(BackgroundContext);
  if (context === undefined) {
    throw new Error('useBackground must be used within a BackgroundProvider');
  }
  return context;
}
