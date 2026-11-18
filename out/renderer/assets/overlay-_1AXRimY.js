import { r as reactExports, j as jsxRuntimeExports, S as Scan, t as translate, X, C as Check, a as clientExports } from "./i18n-BzTRmJIp.js";
function normalize(start, end) {
  return {
    x: Math.min(start.x, end.x),
    y: Math.min(start.y, end.y),
    width: Math.abs(end.x - start.x),
    height: Math.abs(end.y - start.y)
  };
}
function Overlay() {
  const [context, setContext] = reactExports.useState(null);
  const [lang, setLang] = reactExports.useState("en");
  const [rect, setRect] = reactExports.useState(null);
  const startRef = reactExports.useRef(null);
  const rectRef = reactExports.useRef(null);
  reactExports.useEffect(() => {
    let alive = true;
    void (async () => {
      const [ctx, settings] = await Promise.all([
        window.chelpOverlay.context(),
        window.chelp.settings.get()
      ]);
      if (!alive) return;
      if (!ctx) {
        window.chelpOverlay.cancel();
        return;
      }
      setContext(ctx);
      setLang(settings.language);
    })();
    return () => {
      alive = false;
    };
  }, []);
  const cancel = reactExports.useCallback(() => {
    window.chelpOverlay.cancel();
  }, []);
  const confirm = reactExports.useCallback(() => {
    const current = rectRef.current;
    const ctx = context;
    if (!current || current.width < 8 || current.height < 8 || !ctx) return;
    const scaleX2 = ctx.imageWidth / window.innerWidth;
    const scaleY2 = ctx.imageHeight / window.innerHeight;
    window.chelpOverlay.complete({
      x: current.x * scaleX2,
      y: current.y * scaleY2,
      width: current.width * scaleX2,
      height: current.height * scaleY2
    });
  }, [context]);
  reactExports.useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        cancel();
      }
      if (event.key === "Enter") {
        event.preventDefault();
        confirm();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [cancel, confirm]);
  const setSelection = (next) => {
    rectRef.current = next;
    setRect(next);
  };
  const onPointerDown = (event) => {
    if (event.button !== 0) return;
    const point = { x: event.clientX, y: event.clientY };
    startRef.current = point;
    event.currentTarget.setPointerCapture(event.pointerId);
    setSelection({ x: point.x, y: point.y, width: 0, height: 0 });
  };
  const onPointerMove = (event) => {
    if (!startRef.current) return;
    setSelection(normalize(startRef.current, { x: event.clientX, y: event.clientY }));
  };
  const onPointerUp = () => {
    if (!startRef.current) return;
    startRef.current = null;
    const current = rectRef.current;
    if (!current || current.width < 8 || current.height < 8) setSelection(null);
  };
  const scaleX = context ? context.imageWidth / window.innerWidth : 1;
  const scaleY = context ? context.imageHeight / window.innerHeight : 1;
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(
    "div",
    {
      className: "overlay-root",
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onContextMenu: (event) => {
        event.preventDefault();
        cancel();
      },
      children: [
        context ? /* @__PURE__ */ jsxRuntimeExports.jsx(
          "div",
          {
            className: "overlay-shot",
            style: { backgroundImage: `url("${context.image}")` }
          }
        ) : null,
        !rect ? /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "overlay-dim" }) : null,
        rect ? /* @__PURE__ */ jsxRuntimeExports.jsxs(
          "div",
          {
            className: "overlay-selection",
            style: {
              left: rect.x,
              top: rect.y,
              width: rect.width,
              height: rect.height,
              backgroundImage: context ? `url("${context.image}")` : void 0,
              backgroundSize: context ? `${window.innerWidth}px ${window.innerHeight}px` : "100% 100%",
              backgroundPosition: `${-rect.x}px ${-rect.y}px`
            },
            onDoubleClick: (event) => {
              event.stopPropagation();
              confirm();
            },
            children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "overlay-corner tl" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "overlay-corner tr" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "overlay-corner bl" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "overlay-corner br" }),
              /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "overlay-size-label", children: [
                Math.round(rect.width * scaleX),
                " × ",
                Math.round(rect.height * scaleY)
              ] })
            ]
          }
        ) : null,
        !rect ? /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "overlay-hint", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "overlay-hint-icon", children: /* @__PURE__ */ jsxRuntimeExports.jsx(Scan, { size: 18 }) }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("strong", { children: translate(lang, "overlay.hint") }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: translate(lang, "overlay.cancel") })
        ] }) : null,
        /* @__PURE__ */ jsxRuntimeExports.jsxs(
          "div",
          {
            className: "overlay-bar",
            onPointerDown: (event) => event.stopPropagation(),
            onPointerUp: (event) => event.stopPropagation(),
            onDoubleClick: (event) => event.stopPropagation(),
            children: [
              /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "overlay-bar-info", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "overlay-bar-hint", children: rect ? translate(lang, "overlay.doubleClick") : translate(lang, "overlay.hint") }),
                rect ? /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "overlay-bar-size", children: translate(lang, "overlay.size", {
                  w: Math.round(rect.width * scaleX),
                  h: Math.round(rect.height * scaleY)
                }) }) : null
              ] }),
              /* @__PURE__ */ jsxRuntimeExports.jsxs("button", { type: "button", className: "overlay-btn is-ghost", onClick: cancel, children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx(X, { size: 14 }),
                translate(lang, "overlay.cancel")
              ] }),
              /* @__PURE__ */ jsxRuntimeExports.jsxs(
                "button",
                {
                  type: "button",
                  className: "overlay-btn is-primary",
                  disabled: !rect,
                  onClick: confirm,
                  children: [
                    /* @__PURE__ */ jsxRuntimeExports.jsx(Check, { size: 14 }),
                    translate(lang, "overlay.use")
                  ]
                }
              )
            ]
          }
        )
      ]
    }
  );
}
const container = document.getElementById("root");
if (container) {
  clientExports.createRoot(container).render(/* @__PURE__ */ jsxRuntimeExports.jsx(Overlay, {}));
}
