# UI Regression Checklist (run after every UI change)

Desktop
- TALK: один scroll (messages), composer видим.
- FEED: скролл работает, ничего не обрезано.
- Layout: tabs не крадут высоту, нет max-height ловушек.

Mobile
- TALK: скролл внутри сообщений, ввод всегда доступен.
- Нет вылезания текста за границы.

Tech
- Нет новых дублей селекторов в CSS.
- Нет конфликтов media rules.

