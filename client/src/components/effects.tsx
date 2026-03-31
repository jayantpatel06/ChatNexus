import { MessageCircle } from "lucide-react";
import {
  useEffect,
  useRef,
  useState,
  useCallback,
  type ReactNode,
  type MouseEvent as ReactMouseEvent,
} from "react";
import gsap from "gsap";

/* ───────────────────────── hooks ───────────────────────── */

/** Intersection-Observer reveal hook — fires once per element */
export function useReveal(threshold = 0.15) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          el.classList.add("revealed");
          io.unobserve(el);
        }
      },
      {
        threshold,
        // Reveal slightly before the element enters the viewport (helps footer / FAQ at page end)
        rootMargin: "0px 0px 12% 0px",
      },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [threshold]);
  return ref;
}

/** Parallax factor based on scroll position */
export function useParallax() {
  const [offset, setOffset] = useState(0);
  useEffect(() => {
    const onScroll = () => setOffset(window.scrollY);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  return offset;
}

/* ───────────────────── sub-components ──────────────────── */

/** Glassmorphic 3D-tilt card */
export function TiltCard({
  children,
  className = "",
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
}) {
  const card = useRef<HTMLDivElement>(null);
  const glare = useRef<HTMLDivElement>(null);
  const revealRef = useReveal(0.12);

  const handleMove = useCallback((e: ReactMouseEvent<HTMLDivElement>) => {
    const el = card.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const midX = rect.width / 2;
    const midY = rect.height / 2;
    const rotY = ((x - midX) / midX) * 8;
    const rotX = ((midY - y) / midY) * 8;
    gsap.to(el, {
      rotateX: rotX,
      rotateY: rotY,
      duration: 0.4,
      ease: "power2.out",
    });
    if (glare.current) {
      glare.current.style.background = `radial-gradient(circle at ${x}px ${y}px, var(--ln-glare-color) 0%, transparent 70%)`;
    }
  }, []);

  const handleLeave = useCallback(() => {
    const el = card.current;
    if (!el) return;
    gsap.to(el, {
      rotateX: 0,
      rotateY: 0,
      duration: 0.6,
      ease: "elastic.out(1,0.4)",
    });
    if (glare.current) glare.current.style.background = "transparent";
  }, []);

  return (
    <div
      ref={revealRef}
      className={`reveal-item ${className}`}
      style={{ perspective: "800px", transitionDelay: `${delay}ms` }}
    >
      <div
        ref={card}
        onMouseMove={handleMove}
        onMouseLeave={handleLeave}
        className="tilt-card"
        style={{ transformStyle: "preserve-3d" }}
      >
        {/* glare overlay */}
        <div ref={glare} className="tilt-card-glare" />
        {children}
      </div>
    </div>
  );
}

/** Magnetic button wrapper */
export function MagneticWrap({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const handleMove = useCallback((e: ReactMouseEvent<HTMLDivElement>) => {
    const el = wrap.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const dx = e.clientX - (rect.left + rect.width / 2);
    const dy = e.clientY - (rect.top + rect.height / 2);
    gsap.to(el, {
      x: dx * 0.08,
      y: dy * 0.08,
      duration: 0.18,
      ease: "power3.out",
      overwrite: "auto",
    });
  }, []);
  const handleLeave = useCallback(() => {
    gsap.to(wrap.current, {
      x: 0,
      y: 0,
      duration: 0.22,
      ease: "power2.out",
      overwrite: "auto",
    });
  }, []);
  return (
    <div
      ref={wrap}
      className={className}
      onMouseMove={handleMove}
      onMouseLeave={handleLeave}
      style={{ display: "inline-block" }}
    >
      {children}
    </div>
  );
}

/* ───────────────────── Shared Page UI Elements ──────────────────── */

export function CustomCursor() {
  const cursorGlow = useRef<HTMLDivElement>(null);
  const cursorDot = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onMove = (e: globalThis.MouseEvent) => {
      if (cursorGlow.current) {
        gsap.to(cursorGlow.current, {
          x: e.clientX,
          y: e.clientY,
          duration: 0.6,
          ease: "power2.out",
        });
      }
      if (cursorDot.current) {
        gsap.to(cursorDot.current, {
          x: e.clientX,
          y: e.clientY,
          duration: 0.15,
          ease: "power2.out",
        });
      }
    };
    window.addEventListener("mousemove", onMove);
    return () => window.removeEventListener("mousemove", onMove);
  }, []);

  return (
    <>
      <div ref={cursorGlow} className="cursor-glow" />
      <div ref={cursorDot} className="cursor-dot" />
    </>
  );
}

type PagePreloaderProps = {
  onComplete: () => void;
  ready?: boolean;
  watchSelector?: string;
};

function waitForWindowLoad(signal: AbortSignal) {
  if (typeof window === "undefined" || document.readyState === "complete") {
    return Promise.resolve();
  }

  return new Promise<void>((resolve) => {
    const handleLoad = () => {
      window.removeEventListener("load", handleLoad);
      resolve();
    };

    const handleAbort = () => {
      window.removeEventListener("load", handleLoad);
      resolve();
    };

    window.addEventListener("load", handleLoad, { once: true });
    signal.addEventListener("abort", handleAbort, { once: true });
  });
}

function waitForFonts(signal: AbortSignal) {
  const fonts = (document as Document & {
    fonts?: { ready: Promise<unknown> };
  }).fonts;

  if (!fonts?.ready) {
    return Promise.resolve();
  }

  return new Promise<void>((resolve) => {
    const finish = () => resolve();
    void fonts.ready.then(finish, finish);
    signal.addEventListener("abort", finish, { once: true });
  });
}

function waitForImages(root: ParentNode | null, signal: AbortSignal) {
  const images = Array.from((root ?? document).querySelectorAll("img")).filter(
    (image) => image.loading !== "lazy",
  );

  if (images.length === 0) {
    return Promise.resolve();
  }

  return Promise.all(
    images.map(
      (image) =>
        new Promise<void>((resolve) => {
          if (image.complete) {
            resolve();
            return;
          }

          const finish = () => {
            image.removeEventListener("load", finish);
            image.removeEventListener("error", finish);
            resolve();
          };

          image.addEventListener("load", finish, { once: true });
          image.addEventListener("error", finish, { once: true });
          signal.addEventListener("abort", finish, { once: true });
        }),
    ),
  ).then(() => undefined);
}

export function PagePreloader({
  onComplete,
  ready = true,
  watchSelector = ".landing-root",
}: PagePreloaderProps) {
  const preloaderRef = useRef<HTMLDivElement>(null);
  const onCompleteRef = useRef(onComplete);
  const didCompleteRef = useRef(false);

  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  useEffect(() => {
    if (!ready || didCompleteRef.current) {
      return;
    }

    const abortController = new AbortController();
    let isActive = true;

    const finish = () => {
      if (!isActive || didCompleteRef.current) {
        return;
      }

      didCompleteRef.current = true;
      onCompleteRef.current();
    };

    const waitForReady = async () => {
      await Promise.all([
        waitForWindowLoad(abortController.signal),
        waitForFonts(abortController.signal),
      ]);

      if (!isActive) {
        return;
      }

      const root = document.querySelector(watchSelector);
      await waitForImages(root, abortController.signal);

      if (!isActive || !preloaderRef.current) {
        return;
      }

      gsap.killTweensOf(preloaderRef.current);
      gsap.to(preloaderRef.current, {
        opacity: 0,
        duration: 0.35,
        ease: "power2.out",
        pointerEvents: "none",
        onComplete: finish,
      });
    };

    void waitForReady();

    return () => {
      isActive = false;
      abortController.abort();
      if (preloaderRef.current) {
        gsap.killTweensOf(preloaderRef.current);
      }
    };
  }, [ready, watchSelector]);

  return (
    <div ref={preloaderRef} className="preloader">
      <div className="preloader-ring">
        <MessageCircle className="w-8 h-8 text-brand-primary" />
      </div>
    </div>
  );
}

export function AmbientOrbs({ scrollY }: { scrollY: number }) {
  return (
    <div className="ambient-orbs" aria-hidden>
      <div
        className="orb orb-purple"
        style={{ transform: `translate(-50%, calc(-50% + ${scrollY * 0.15}px))` }}
      />
      <div
        className="orb orb-cyan"
        style={{ transform: `translate(-50%, calc(-50% + ${scrollY * -0.1}px))` }}
      />
      <div
        className="orb orb-small"
        style={{ transform: `translate(-50%, calc(-50% + ${scrollY * 0.22}px))` }}
      />
    </div>
  );
}
