# UI CONTRACTS (TendAI)

## TALK contract
- Единственный scroll owner: `.chat-scroll-wrapper` (messages).
- Composer всегда видим; flex-shrink:0; не абсолютный; не скрывается.
- Запрещённые паттерны в TALK: `overflow:hidden` на talk-view/conversation-card, `max-height:100%` на message viewport, второй scroll в `#centerBody`.

## FEED contract
- Scroll находится внутри FEED view (контент), tabs/header не скроллятся.
- Tabs фиксированы, но не крадут полезную высоту (без отрицательных margin).

## LAYOUT contract
- Центр (col-center) — flex column; `#centerBody` — flex column с min-height:0; view-уровень отвечает за scroll.
- Запрет двойного скролла: только один scroll owner на уровень view (Feed/Talk/Services/Profile).
- Высоту контролируют flex-правила, а не `max-height`/`overflow:hidden` на критичных контейнерах.

## MOBILE contract
- Input (composer) всегда доступен, не перекрывается bottom-nav.
- Запрещены “пропадающие” области ввода; скролл сообщений остаётся внутри message viewport.

