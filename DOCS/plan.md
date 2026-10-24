# Project Plan: NestJS + grammY + React Telegram Demo App

## 1. Objective
Build a lightweight application to dispatch Telegram notifications to a specific Chat ID, featuring interactive Inline Keyboards and a web frontend for testing.

---

## 2. System Architecture

```text
┌─────────────────┐       HTTP POST       ┌─────────────────────┐
│  React Frontend ├──────────────────────►│    NestJS Backend   │
│  (Vite App)     │                       │  (Telegram Service) │
└─────────────────┘                       └──────────┬──────────┘
                                                     │
                                           Telegram Bot API (grammY)
                                                     │
                                                     ▼
                                          ┌─────────────────────┐
                                          │ User Telegram App   │
                                          │ [ Interactive UI ]  │
                                          └─────────────────────┘

```
---

## 3. project structure

```
telegram-demo/
├── backend/                  # NestJS API
│   ├── src/
│   │   ├── telegram/
│   │   │   ├── telegram.controller.ts
│   │   │   ├── telegram.service.ts
│   │   │   └── telegram.module.ts
│   │   ├── app.module.ts
│   │   └── main.ts
│   ├── package.json
│   └── tsconfig.json
│
└── frontend/                 # React (Vite) Testing UI
    ├── src/
    │   ├── App.jsx
    │   ├── App.css
    │   └── main.jsx
    ├── package.json
    └── vite.config.js
```