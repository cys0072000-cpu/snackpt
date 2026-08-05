/*
 * 스낵PT 서비스 워커 — 오프라인에서도 앱이 열리게 한다.
 *
 * 배경: 이 앱은 홈 화면 아이콘이지만 실제로는 매번 여는 순간 인터넷에서
 * index.html을 새로 받아온다. 헬스장처럼 신호가 약한 곳에서 열면 그 요청이
 * 실패하고, 대체할 게 없어서 화면이 검게 멈춘 채로 아무것도 못 한다.
 *
 * 전략: 온라인일 때는 항상 네트워크를 먼저 쓰고(최신 버전을 보장), 그 응답을
 * 캐시에 갱신해둔다. 네트워크가 실패하면 그 캐시로 대신 응답한다.
 * 캐시 이름에 버전을 넣어서, 새 버전을 배포하면(APP_VERSION 변경) 자동으로
 * 새 캐시를 만들고 이전 캐시는 activate 시점에 정리한다.
 */
const CACHE = "snackpt-v1.9";

const PRECACHE = [
  "./",
  "./index.html",
  "./manifest.json",
  "./icons/icon-180.png",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-32.png",
  "./icons/icon-16.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

/* 문서(페이지 자체) 요청은 캐시무효화용 "?v=..." 쿼리를 무시하고
   하나의 키(./)로 통일한다. 그러지 않으면 새로고침 버튼을 누를 때마다
   새 쿼리 문자열이 캐시에 계속 쌓인다. */
function cacheKeyFor(request, url) {
  const isDoc = request.mode === "navigate" || url.pathname.endsWith("/index.html") || url.pathname.endsWith("/snackpt/");
  return isDoc ? new Request(new URL("./", self.registration.scope).toString()) : request;
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;   // 유튜브·드라이브 등 남의 도메인은 손대지 않는다

  const key = cacheKeyFor(req, url);

  e.respondWith(
    fetch(req)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(key, copy));
        return res;
      })
      .catch(() =>
        caches.match(key).then((hit) => hit || caches.match("./index.html"))
      )
  );
});
