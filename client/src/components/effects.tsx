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
      { threshold },
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
      glare.current.style.background = `radial-gradient(circle at ${x}px ${y}px, rgba(130,57,255,0.18) 0%, transparent 70%)`;
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
      x: dx * 0.25,
      y: dy * 0.25,
      duration: 0.3,
      ease: "power2.out",
    });
  }, []);
  const handleLeave = useCallback(() => {
    gsap.to(wrap.current, {
      x: 0,
      y: 0,
      duration: 0.5,
      ease: "elastic.out(1,0.35)",
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

export function PagePreloader({ onComplete }: { onComplete: () => void }) {
  const preloaderRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const tl = gsap.timeline({
      onComplete,
    });
    tl.to(preloaderRef.current, {
      opacity: 0,
      duration: 0.6,
      delay: 0.8,
      ease: "power3.inOut",
      pointerEvents: "none",
    });
  }, [onComplete]);

  return (
    <div ref={preloaderRef} className="preloader">
      <div className="preloader-ring">
        <MessageCircle className="w-8 h-8 text-[#8239FF]" />
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
