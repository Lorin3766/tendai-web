# Definition of Done (fast check, 20–30 seconds)
1) Ctrl+Shift+R (hard reload) with cache disabled.
2) Console: 0 красных ошибок; если ассеты отсутствуют — только warning, не error.
3) Network: фильтр 404 — core не должен давать 404; ассеты желательно без 404.
4) Лог: `[RUN MODE] ...`; smoke test PASS (core). Assets могут быть warning, но не ломают PASS.
5) FEED: есть видимый контекст даты+времени; рендерит 5 карточек; вкладки переключаются; нет дублей Evening check-in.
6) Если трогали ассеты: открыть критичные URL (nebula PNG, favicon) — убедиться, что не 404.
