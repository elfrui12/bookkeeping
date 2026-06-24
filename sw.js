// =============================================================================
// 记账本 Service Worker - 离线缓存支持
// =============================================================================
const CACHE_NAME = 'bookkeeping-v4';
const APP_VERSION = '1.0.0';

const PRE_CACHE_URLS = [
  '/',
  'index.html',
  'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js'
];

// 安装：预缓存关键资源
self.addEventListener('install', (event) => {
  console.log('[SW] 安装中...');
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] 预缓存资源');
      return cache.addAll(PRE_CACHE_URLS).catch((err) => {
        // 某些外部资源可能加载失败，但不影响安装
        console.warn('[SW] 预缓存部分失败:', err.message);
      });
    }).then(() => {
      return self.skipWaiting(); // 立即激活
    })
  );
});

// 激活：清理旧缓存
self.addEventListener('activate', (event) => {
  console.log('[SW] 激活中...');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    }).then(() => {
      return self.clients.claim(); // 立即接管所有页面
    })
  );
});

// 网络优先策略：先尝试网络，失败时使用缓存
self.addEventListener('fetch', (event) => {
  // 跳过非 GET 请求和 Supabase API 请求（这些需要实时数据）
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // Supabase API 请求：仅网络（不缓存 API 数据）
  if (url.hostname.includes('supabase.co')) {
    return;
  }

  // 页面和静态资源：网络优先，失败时回退到缓存
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // 缓存成功的 GET 响应（仅同源资源）
        if (response.ok && url.origin === self.location.origin) {
          const cloned = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, cloned);
          });
        }
        return response;
      })
      .catch(() => {
        // 网络失败时尝试从缓存获取
        return caches.match(event.request).then((cached) => {
          if (cached) return cached;
          // 对于 HTML 页面请求，返回缓存的首页（App Shell 模式）
          if (event.request.headers.get('accept')?.includes('text/html')) {
            return caches.match('/');
          }
          return new Response('离线状态，请连接网络后重试', {
            status: 503,
            headers: { 'Content-Type': 'text/plain; charset=utf-8' }
          });
        });
      })
  );
});

// 接收来自页面的消息
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  if (event.data?.type === 'GET_VERSION') {
    event.ports[0]?.postMessage({ version: APP_VERSION });
  }
});
