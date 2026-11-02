/* Functional motion for the numerical laboratory. GSAP 3.15.0, served locally. */
(() => {
  const engine = window.gsap;
  if (!engine) return;
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
  const tweens = new WeakMap();
  let resultTimeline = null;
  const resultTargets = () => [
    ...document.querySelectorAll(
      ".primary-result, .chart-panel, #methodTableCard",
    ),
  ];
  const clear = (element) => {
    if (!element) return;
    tweens.get(element)?.kill();
    engine.killTweensOf(element);
    engine.set(element, { clearProps: "transform,opacity,visibility" });
  };
  function reveal(element, { distance = 10, duration = 0.4, scale = 1 } = {}) {
    if (!element || element.hidden) return;
    const active = tweens.get(element)?.isActive();
    tweens.get(element)?.kill();
    if (!active)
      engine.set(element, {
        opacity: reduce.matches ? 0.7 : 0.45,
        y: reduce.matches ? 0 : distance,
        scale: reduce.matches ? 1 : scale,
      });
    const tween = engine.to(element, {
      opacity: 1,
      y: 0,
      scale: 1,
      duration: reduce.matches ? 0.14 : duration,
      ease: "power2.out",
      overwrite: "auto",
      clearProps: "opacity,transform,visibility",
    });
    tweens.set(element, tween);
  }
  function disclosure(element, open, { immediate = false, menu = false } = {}) {
    if (!element) return;
    const alreadyClosed = element.hidden;
    const active = tweens.get(element)?.isActive();
    tweens.get(element)?.kill();
    element.dataset.open = String(open);
    element.inert = !open;
    element.setAttribute("aria-hidden", String(!open));
    if (immediate || (!open && alreadyClosed)) {
      element.hidden = !open;
      clear(element);
      return;
    }
    if (open) {
      element.hidden = false;
      if (!active)
        engine.set(element, {
          opacity: reduce.matches ? 0.7 : 0.35,
          y: reduce.matches ? 0 : -8,
          scale: reduce.matches || !menu ? 1 : 0.97,
        });
      const tween = engine.to(element, {
        opacity: 1,
        y: 0,
        scale: 1,
        duration: reduce.matches ? 0.14 : 0.4,
        ease: "power2.out",
        overwrite: "auto",
        clearProps: "opacity,transform,visibility",
      });
      tweens.set(element, tween);
    } else {
      const tween = engine.to(element, {
        opacity: 0,
        y: reduce.matches ? 0 : -5,
        duration: reduce.matches ? 0.1 : 0.2,
        ease: "power2.out",
        overwrite: "auto",
        onComplete() {
          if (element.dataset.open === "false") {
            element.hidden = true;
            clear(element);
          }
        },
      });
      tweens.set(element, tween);
    }
  }
  function results() {
    const targets = resultTargets();
    const interrupted = resultTimeline?.isActive();
    resultTimeline?.kill();
    if (!interrupted)
      engine.set(targets, {
        opacity: reduce.matches ? 0.75 : 0.45,
        y: reduce.matches ? 0 : 14,
      });
    resultTimeline = engine.timeline({
      defaults: {
        duration: reduce.matches ? 0.14 : 0.4,
        ease: "power2.out",
        overwrite: "auto",
      },
    });
    resultTimeline.to(
      targets,
      {
        opacity: 1,
        y: 0,
        stagger: reduce.matches ? 0 : 0.045,
        clearProps: "opacity,transform,visibility",
      },
      0,
    );
  }
  const media = engine.matchMedia();
  media.add(
    "(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)",
    () => {
      const buttons = [...document.querySelectorAll("button, .source-link")];
      const listeners = buttons.map((element) => {
        const restingShadow = getComputedStyle(element).boxShadow;
        const enter = () => {
          if (element.disabled) return;
          engine.to(element, {
            y: -2,
            boxShadow: "0 8px 16px rgba(23,43,66,0.10)",
            duration: 0.22,
            ease: "power2.out",
            overwrite: "auto",
          });
        };
        const leave = () =>
          engine.to(element, {
            y: 0,
            boxShadow: restingShadow,
            duration: 0.28,
            ease: "power2.out",
            overwrite: "auto",
            clearProps: "transform,boxShadow",
          });
        element.classList.add("gsap-hover");
        element.addEventListener("pointerenter", enter);
        element.addEventListener("pointerleave", leave);
        element.addEventListener("blur", leave);
        return { element, enter, leave };
      });
      return () =>
        listeners.forEach(({ element, enter, leave }) => {
          element.removeEventListener("pointerenter", enter);
          element.removeEventListener("pointerleave", leave);
          element.removeEventListener("blur", leave);
          engine.killTweensOf(element);
          engine.set(element, { clearProps: "transform,boxShadow" });
          element.classList.remove("gsap-hover");
        });
    },
  );
  document.querySelectorAll("details").forEach((detail) => {
    const summary = detail.querySelector("summary");
    const content = [...detail.children].find((child) => child !== summary);
    if (!summary || !content) return;
    summary.addEventListener("click", (event) => {
      event.preventDefault();
      const open = !(
        detail.dataset.open === "true" ||
        (detail.dataset.open === undefined && detail.open)
      );
      detail.dataset.open = String(open);
      summary.setAttribute("aria-expanded", String(open));
      content.inert = !open;
      if (open) {
        detail.open = true;
        reveal(content);
      } else {
        tweens.get(content)?.kill();
        const tween = engine.to(content, {
          opacity: 0,
          y: reduce.matches ? 0 : -4,
          duration: reduce.matches ? 0.1 : 0.2,
          ease: "power2.out",
          overwrite: "auto",
          onComplete() {
            if (detail.dataset.open === "false") {
              detail.open = false;
              clear(content);
            }
          },
        });
        tweens.set(content, tween);
      }
    });
  });
  reduce.addEventListener("change", () => {
    resultTimeline?.kill();
    resultTargets().forEach(clear);
    document
      .querySelectorAll(
        "#sourceControls, #methodNav, .data-context, .warn-box, .how-text, .raw-data .table-scroll, .project-credits",
      )
      .forEach((element) => {
        clear(element);
        if (element.dataset.open === "false") element.hidden = true;
      });
    document.querySelectorAll("details[data-open]").forEach((detail) => {
      detail.open = detail.dataset.open === "true";
      const content = [...detail.children].find(
        (child) => child.tagName !== "SUMMARY",
      );
      if (content) content.inert = !detail.open;
    });
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      resultTimeline?.progress(1);
    }
  });
  window.LabMotion = { reveal, disclosure, results, clear };
})();
