import { c as createLucideIcon, r as reactExports, t as translate, j as jsxRuntimeExports, X, S as Scan, a as clientExports } from "./i18n-C9zF5Stk.js";
import { v as visionProviderFor, i as isProviderReady, S as Spinner, L as Logo, I as IconButton, P as Plus, C as ChevronDown, M as Markdown, T as ThinkingText, a as CircleAlert, R as RotateCcw, b as Paperclip, c as Square, A as ArrowUp, f as formatKey } from "./ui-CUbETdDl.js";
/**
 * @license lucide-react v0.469.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const ExternalLink = createLucideIcon("ExternalLink", [
  ["path", { d: "M15 3h6v6", key: "1q9fwt" }],
  ["path", { d: "M10 14 21 3", key: "gplh6r" }],
  ["path", { d: "M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6", key: "a6xqqp" }]
]);
const STORAGE_KEY = "chelp.float.conversation";
function FloatApp() {
  const [settings, setSettings] = reactExports.useState(null);
  const [conversation, setConversation] = reactExports.useState(null);
  const [conversationId, setConversationId] = reactExports.useState(
    () => localStorage.getItem(STORAGE_KEY)
  );
  const [text, setText] = reactExports.useState("");
  const [attachments, setAttachments] = reactExports.useState([]);
  const [streaming, setStreaming] = reactExports.useState(null);
  const [error, setError] = reactExports.useState(null);
  const [collapsed, setCollapsed] = reactExports.useState(false);
  const [capturing, setCapturing] = reactExports.useState(false);
  const [confirming, setConfirming] = reactExports.useState(null);
  const [sending, setSending] = reactExports.useState(false);
  const [lightbox, setLightbox] = reactExports.useState(null);
  const scrollRef = reactExports.useRef(null);
  const textareaRef = reactExports.useRef(null);
  const conversationIdRef = reactExports.useRef(conversationId);
  const lang = settings?.language ?? "en";
  const t = reactExports.useCallback(
    (key, params) => translate(lang, key, params),
    [lang]
  );
  const activeProvider = settings ? settings.providers.find((p) => p.id === settings.activeProviderId) ?? settings.providers[0] : void 0;
  const visionProvider = settings ? visionProviderFor(settings.providers, settings.activeProviderId, settings.autoSwitchProvider) : void 0;
  const hasKey = Boolean(settings?.providers.some(isProviderReady));
  const providerLabel = attachments.length > 0 ? visionProvider ? `${visionProvider.name} · ${visionProvider.model}` : t("screen.visionTitle") : activeProvider ? `${activeProvider.name} · ${activeProvider.model}` : "AI";
  reactExports.useEffect(() => {
    let alive = true;
    void (async () => {
      const loaded = await window.chelp.settings.get();
      if (!alive) return;
      setSettings(loaded);
      setCollapsed(loaded.floatCollapsed);
      if (conversationId) {
        const stored = await window.chelp.conversations.get(conversationId);
        if (!alive) return;
        if (stored) setConversation(stored);
        else {
          localStorage.removeItem(STORAGE_KEY);
          conversationIdRef.current = null;
          setConversationId(null);
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, []);
  reactExports.useEffect(() => {
    const unsubscribers = [
      window.chelp.settings.onChanged((next) => setSettings(next)),
      window.chelp.float.onCollapsed((value) => setCollapsed(value)),
      window.chelp.conversations.onChanged((list) => {
        const current = conversationIdRef.current;
        if (current && !list.some((item) => item.id === current)) {
          localStorage.removeItem(STORAGE_KEY);
          conversationIdRef.current = null;
          setConversationId(null);
          setConversation(null);
          setStreaming(null);
        }
      }),
      window.chelp.chat.onUserMessage(({ conversationId: id, conversation: next }) => {
        if (id === conversationIdRef.current) setConversation(next);
      }),
      window.chelp.chat.onStart(({ conversationId: id, providerLabel: label }) => {
        if (id === conversationIdRef.current) {
          setError(null);
          setStreaming({ text: "", providerLabel: label });
        }
      }),
      window.chelp.chat.onDelta(({ conversationId: id, delta }) => {
        if (id !== conversationIdRef.current) return;
        setStreaming(
          (current) => current ? { ...current, text: current.text + delta } : current
        );
      }),
      window.chelp.chat.onDone(({ conversationId: id, conversation: next }) => {
        if (id !== conversationIdRef.current) return;
        setConversation(next);
        setStreaming(null);
      }),
      window.chelp.chat.onError(({ conversationId: id, error: next }) => {
        if (id !== conversationIdRef.current) return;
        setStreaming(null);
        if (next.code !== "aborted") setError(next);
      })
    ];
    return () => {
      for (const unsubscribe of unsubscribers) unsubscribe();
    };
  }, []);
  reactExports.useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [conversation?.messages.length, streaming?.text, error]);
  reactExports.useEffect(() => {
    if (!textareaRef.current) return;
    textareaRef.current.style.height = "auto";
    textareaRef.current.style.height = `${Math.min(96, textareaRef.current.scrollHeight)}px`;
  }, [text]);
  const ensureConversation = async (mode) => {
    if (conversationIdRef.current) return conversationIdRef.current;
    const created = await window.chelp.conversations.create({ mode });
    localStorage.setItem(STORAGE_KEY, created.id);
    conversationIdRef.current = created.id;
    setConversationId(created.id);
    setConversation(created);
    return created.id;
  };
  const deliver = async (value, files) => {
    if (!hasKey || !settings) return;
    const mode = files.length > 0 ? "screen" : "chat";
    const finalText = value.trim() || (files.length ? t("screen.defaultQuestion") : "");
    if (!finalText && files.length === 0) return;
    if (files.length > 0 && !visionProvider) {
      window.chelp.app.focus("open-ai");
      return;
    }
    setSending(true);
    setError(null);
    try {
      const id = await ensureConversation(mode);
      const result = await window.chelp.chat.send({
        conversationId: id,
        text: finalText,
        attachments: files,
        mode,
        surface: "float"
      });
      if (result.ok) {
        setText("");
        setAttachments([]);
      } else if (result.error) {
        setError(result.error);
      }
    } finally {
      setSending(false);
    }
  };
  const handleSend = () => {
    if (streaming || sending) return;
    const value = text.trim();
    if (!value && attachments.length === 0) return;
    if (attachments.length > 0 && settings?.confirmBeforeSend) {
      setConfirming({ text: value, files: attachments });
      return;
    }
    void deliver(value, attachments);
  };
  const addImages = async () => {
    const picked = await window.chelp.capture.pickImages();
    if (picked.length) setAttachments((current) => [...current, ...picked]);
  };
  const captureRegion = async () => {
    if (!settings) return;
    setCapturing(true);
    try {
      const displays = await window.chelp.capture.screens(settings.captureQuality);
      const primary = displays.find((display) => display.primary) ?? displays[0];
      if (!primary) return;
      const shot = await window.chelp.capture.selectRegion(primary.id);
      if (!shot) return;
      const attachment = await window.chelp.capture.saveImage(shot.dataUrl);
      setAttachments((current) => [...current, attachment]);
      requestAnimationFrame(() => textareaRef.current?.focus());
    } finally {
      setCapturing(false);
    }
  };
  const startNewChat = () => {
    const current = conversationIdRef.current;
    conversationIdRef.current = null;
    if (current && streaming) void window.chelp.chat.abort(current);
    localStorage.removeItem(STORAGE_KEY);
    setConversationId(null);
    setConversation(null);
    setText("");
    setAttachments([]);
    setStreaming(null);
    setError(null);
    requestAnimationFrame(() => textareaRef.current?.focus());
  };
  const collapse = () => {
    setCollapsed(true);
    void window.chelp.float.setCollapsed(true);
  };
  const expand = () => {
    setCollapsed(false);
    void window.chelp.float.setCollapsed(false);
  };
  const openInApp = () => {
    if (conversationId) window.chelp.app.openConversation(conversationId);
    else window.chelp.app.focus("open-assistant");
    void window.chelp.float.hide();
  };
  const messages = reactExports.useMemo(() => conversation?.messages ?? [], [conversation]);
  if (!settings) {
    return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "float-loading", children: /* @__PURE__ */ jsxRuntimeExports.jsx(Spinner, { size: 18 }) });
  }
  if (collapsed) {
    return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "float-orb-wrap", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("button", { type: "button", className: "float-orb", onClick: expand, title: t("float.expand"), children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "float-orb-glow" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(Logo, { size: 34 })
    ] }) });
  }
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "float-shell", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("header", { className: "float-head", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "float-brand", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(Logo, { size: 20 }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("strong", { children: t("float.title") }),
        hasKey ? /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "float-status" }) : null
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "float-head-actions", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(IconButton, { label: t("float.newChat"), onClick: startNewChat, children: /* @__PURE__ */ jsxRuntimeExports.jsx(Plus, { size: 15 }) }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(IconButton, { label: t("float.openApp"), onClick: openInApp, children: /* @__PURE__ */ jsxRuntimeExports.jsx(ExternalLink, { size: 14 }) }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(IconButton, { label: t("float.collapse"), onClick: collapse, children: /* @__PURE__ */ jsxRuntimeExports.jsx(ChevronDown, { size: 15 }) }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(IconButton, { label: t("float.close"), onClick: () => void window.chelp.float.hide(), children: /* @__PURE__ */ jsxRuntimeExports.jsx(X, { size: 15 }) })
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "float-body", ref: scrollRef, children: messages.length === 0 && !streaming ? /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "float-empty", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(Logo, { size: 38 }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("strong", { children: t("float.empty") }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: t("assistant.subtitle") }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "float-suggest", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "button",
          {
            type: "button",
            onClick: () => {
              setText(t("assistant.suggest.errorPrompt"));
              requestAnimationFrame(() => textareaRef.current?.focus());
            },
            children: t("assistant.suggest.error")
          }
        ),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "button",
          {
            type: "button",
            onClick: () => {
              setText(t("assistant.suggest.codePrompt"));
              requestAnimationFrame(() => textareaRef.current?.focus());
            },
            children: t("assistant.suggest.code")
          }
        )
      ] })
    ] }) : /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "float-messages", children: [
      messages.map((message) => /* @__PURE__ */ jsxRuntimeExports.jsx(
        FloatMessage,
        {
          message,
          onLightbox: setLightbox,
          t
        },
        message.id
      )),
      streaming ? /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "float-msg is-assistant", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "float-msg-avatar", children: /* @__PURE__ */ jsxRuntimeExports.jsx(Logo, { size: 18 }) }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "float-msg-body", children: streaming.text ? /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(Markdown, { content: streaming.text }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "stream-caret" })
        ] }) : /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "float-thinking", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "thinking-dots", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", {}),
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", {}),
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", {})
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(ThinkingText, {})
        ] }) })
      ] }) : null,
      error ? /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "float-error", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(CircleAlert, { size: 14 }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("strong", { children: t("assistant.error.title") }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: t(`errors.${error.code}`) }),
          error.providerLabel ? /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "float-error-provider", children: error.providerLabel }) : null
        ] }),
        conversationId ? /* @__PURE__ */ jsxRuntimeExports.jsxs(
          "button",
          {
            type: "button",
            onClick: () => {
              setError(null);
              void window.chelp.chat.regenerate(conversationId, "float");
            },
            children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(RotateCcw, { size: 12 }),
              t("common.retry")
            ]
          }
        ) : null
      ] }) : null
    ] }) }),
    !hasKey ? /* @__PURE__ */ jsxRuntimeExports.jsx("button", { type: "button", className: "float-banner", onClick: () => window.chelp.app.focus("open-ai"), children: t("ai.noKeyBanner") }) : null,
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "float-composer", children: [
      attachments.length > 0 ? /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "float-attachments", children: [
        attachments.map((attachment) => /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "float-attachment", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("img", { src: attachment.url, alt: attachment.name }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "button",
            {
              type: "button",
              onClick: () => setAttachments((current) => current.filter((item) => item.id !== attachment.id)),
              "aria-label": t("float.remove"),
              children: /* @__PURE__ */ jsxRuntimeExports.jsx(X, { size: 10 })
            }
          )
        ] }, attachment.id)),
        !visionProvider ? /* @__PURE__ */ jsxRuntimeExports.jsx(
          "button",
          {
            type: "button",
            className: "float-attachment-warn",
            onClick: () => window.chelp.app.focus("open-ai"),
            children: t("screen.visionTitle")
          }
        ) : null
      ] }) : null,
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "float-input", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "textarea",
          {
            ref: textareaRef,
            value: text,
            rows: 1,
            placeholder: t("float.placeholder"),
            onChange: (event) => setText(event.target.value),
            onKeyDown: (event) => {
              if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
              const chord = event.ctrlKey || event.metaKey;
              const send = settings.enterToSend ? !event.shiftKey : chord;
              if (!send) return;
              event.preventDefault();
              handleSend();
            }
          }
        ),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "float-input-bar", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "float-tools", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(IconButton, { label: t("assistant.attach"), onClick: () => void addImages(), children: /* @__PURE__ */ jsxRuntimeExports.jsx(Paperclip, { size: 14 }) }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              IconButton,
              {
                label: t("float.capture"),
                onClick: () => void captureRegion(),
                disabled: capturing,
                children: capturing ? /* @__PURE__ */ jsxRuntimeExports.jsx(Spinner, { size: 13 }) : /* @__PURE__ */ jsxRuntimeExports.jsx(Scan, { size: 14 })
              }
            ),
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "float-provider", title: providerLabel, children: (attachments.length > 0 ? visionProvider : activeProvider)?.model ?? t("nav.apiMissing") })
          ] }),
          streaming ? /* @__PURE__ */ jsxRuntimeExports.jsx(
            "button",
            {
              type: "button",
              className: "float-send is-stop",
              onClick: () => conversationId && void window.chelp.chat.abort(conversationId),
              "aria-label": t("common.stop"),
              children: /* @__PURE__ */ jsxRuntimeExports.jsx(Square, { size: 11 })
            }
          ) : /* @__PURE__ */ jsxRuntimeExports.jsx(
            "button",
            {
              type: "button",
              className: "float-send",
              onClick: handleSend,
              disabled: !text.trim() && attachments.length === 0 || !hasKey,
              "aria-label": t("common.send"),
              children: /* @__PURE__ */ jsxRuntimeExports.jsx(ArrowUp, { size: 15 })
            }
          )
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "float-foot", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: t("float.hint") }),
        settings ? /* @__PURE__ */ jsxRuntimeExports.jsx("kbd", { className: "kbd", children: formatKey(settings.hotkeys.float) }) : null
      ] })
    ] }),
    lightbox ? /* @__PURE__ */ jsxRuntimeExports.jsx(
      "div",
      {
        className: "float-lightbox",
        onClick: () => setLightbox(null),
        role: "presentation",
        children: /* @__PURE__ */ jsxRuntimeExports.jsx("img", { src: lightbox, alt: "" })
      }
    ) : null,
    confirming ? /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "float-confirm", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "float-confirm-card", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("strong", { children: t("assistant.confirmTitle") }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { children: t("assistant.confirmText", { provider: providerLabel }) }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "float-confirm-actions", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("button", { type: "button", onClick: () => setConfirming(null), children: t("common.cancel") }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "button",
          {
            type: "button",
            className: "is-primary",
            onClick: () => {
              const payload = confirming;
              setConfirming(null);
              void deliver(payload.text, payload.files);
            },
            children: t("common.send")
          }
        )
      ] })
    ] }) }) : null
  ] });
}
function FloatMessage({
  message,
  onLightbox,
  t
}) {
  if (message.role === "user") {
    return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "float-msg is-user", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "float-msg-body", children: [
      message.attachments?.length ? /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "float-msg-images", children: message.attachments.map((attachment) => /* @__PURE__ */ jsxRuntimeExports.jsx("button", { type: "button", onClick: () => onLightbox(attachment.url), children: /* @__PURE__ */ jsxRuntimeExports.jsx("img", { src: attachment.url, alt: attachment.name }) }, attachment.id)) }) : null,
      message.content ? /* @__PURE__ */ jsxRuntimeExports.jsx("p", { children: message.content }) : null
    ] }) });
  }
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "float-msg is-assistant", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "float-msg-avatar", children: /* @__PURE__ */ jsxRuntimeExports.jsx(Logo, { size: 18 }) }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "float-msg-body", children: message.content ? /* @__PURE__ */ jsxRuntimeExports.jsx(Markdown, { content: message.content }) : message.error ? /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "float-msg-error", children: t(`errors.${message.error.code}`) }) : null })
  ] });
}
const container = document.getElementById("root");
if (container) {
  clientExports.createRoot(container).render(/* @__PURE__ */ jsxRuntimeExports.jsx(FloatApp, {}));
}
