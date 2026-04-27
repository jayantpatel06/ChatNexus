import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useLocation, Link } from "wouter";
import { useForm, type FieldErrors } from "react-hook-form";
import { Eye, EyeOff, Loader2, X } from "lucide-react";
import type { GuestLogin, LoginUser, RegisterUser } from "@shared/schema";
import { Seo } from "@/components/seo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/providers/auth-provider";
import { cn } from "@/lib/utils";

const AUTH_SEO_DESCRIPTION =
  "Log in, register, or continue as a guest to start chatting on ChatNexus.";

const FIELD_CLASS_NAME =
  "h-11 rounded-[1rem] border border-white/10 bg-white/[0.06] px-4 text-sm text-white placeholder:text-white/30 shadow-none backdrop-blur-sm focus-visible:ring-1 focus-visible:ring-white/20";
const SELECT_PANEL_CLASS_NAME =
  "border-white/10 bg-[#17171c] text-white shadow-[0_20px_50px_rgba(0,0,0,0.45)]";
const PRIMARY_BUTTON_CLASS_NAME =
  "h-11 w-full rounded-[1rem] bg-gradient-to-r from-[var(--brand-grad-start)] to-[var(--brand-grad-end)] text-sm font-semibold text-[var(--primary-foreground)] transition-all duration-200 hover:brightness-105";
const AUTH_TITLE_CLASS_NAME =
  "[font-family:var(--font-display)] text-[clamp(1.95rem,4vw,2.35rem)] font-semibold tracking-[-0.05em] text-white";
const AUTH_DESCRIPTION_CLASS_NAME =
  "mt-2 text-[0.98rem] leading-6 text-white/50";
const AUTH_CARD_STYLE = {
  opacity: 0,
  background:
    "linear-gradient(180deg, color-mix(in srgb, #151b22 78%, var(--brand-grad-start) 22%), color-mix(in srgb, #0b1015 88%, var(--brand-grad-end) 12%))",
  borderColor:
    "color-mix(in srgb, var(--brand-border) 82%, rgba(255,255,255,0.08))",
  boxShadow:
    "0 28px 80px rgba(0,0,0,0.55), 0 0 0 1px color-mix(in srgb, var(--brand-glow-accent) 10%, transparent), inset 0 1px 0 color-mix(in srgb, var(--brand-glow-accent) 28%, rgba(255,255,255,0.08))",
} satisfies CSSProperties;
const AUTH_BACKGROUND_STYLE = {
  background:
    "radial-gradient(circle at 82% 10%, var(--brand-glow-primary) 0%, transparent 28%), radial-gradient(circle at 14% 84%, var(--brand-glow-accent) 0%, transparent 24%), linear-gradient(180deg, rgba(255,255,255,0.04), transparent 32%)",
} satisfies CSSProperties;
const AUTH_STREAK_PRIMARY_STYLE = {
  background:
    "linear-gradient(180deg, color-mix(in srgb, var(--brand-grad-start) 72%, white 28%), transparent 78%)",
} satisfies CSSProperties;
const AUTH_STREAK_SECONDARY_STYLE = {
  background:
    "linear-gradient(180deg, color-mix(in srgb, var(--brand-grad-end) 64%, white 20%), transparent 75%)",
} satisfies CSSProperties;
const AUTH_HEADER_GLOW_STYLE = {
  background:
    "linear-gradient(180deg, color-mix(in srgb, var(--brand-glow-accent) 55%, transparent), transparent)",
} satisfies CSSProperties;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type AuthMode = "guest" | "login" | "register";
type GenderOption = "Male" | "Female" | "Other";
type RegisterFormData = Omit<RegisterUser, "gender"> & {
  gender?: GenderOption;
};
type GuestFormData = Omit<GuestLogin, "gender"> & {
  gender?: GenderOption;
};

const MODE_COPY: Record<
  AuthMode,
  {
    title: string;
    description: string;
    primaryLabel: string;
  }
> = {
  login: {
    title: "Sign In",
    description: "Please enter your details to sign in.",
    primaryLabel: "Sign in",
  },
  register: {
    title: "Sign Up",
    description: "Create your details to start chatting.",
    primaryLabel: "Create account",
  },
  guest: {
    title: "Guest Access",
    description: "Please enter your details to sign in.",
    primaryLabel: "Enter as Guest",
  },
};

const showGuestToggleFooter = (mode: AuthMode) =>
  mode === "guest" || mode === "login";

const getInitialAuthMode = (): AuthMode => {
  if (typeof window === "undefined") {
    return "login";
  }

  const mode = new URLSearchParams(window.location.search).get("mode");
  if (mode === "guest" || mode === "register" || mode === "login") {
    return mode;
  }

  return "login";
};

const DEFAULT_POST_AUTH_PATH = "/dashboard";
const ALLOWED_POST_AUTH_PATHS = new Set([
  "/dashboard",
  "/global-chat",
  "/random-chat",
  "/settings",
]);

function getPostAuthRedirectPath() {
  if (typeof window === "undefined") {
    return DEFAULT_POST_AUTH_PATH;
  }

  const rawRedirect = new URLSearchParams(window.location.search).get(
    "redirect",
  );

  if (!rawRedirect) {
    return DEFAULT_POST_AUTH_PATH;
  }

  if (!rawRedirect.startsWith("/") || rawRedirect.startsWith("//")) {
    return DEFAULT_POST_AUTH_PATH;
  }

  try {
    const redirectUrl = new URL(rawRedirect, window.location.origin);
    const redirectPath = redirectUrl.pathname;

    if (!ALLOWED_POST_AUTH_PATHS.has(redirectPath)) {
      return DEFAULT_POST_AUTH_PATH;
    }

    return redirectPath;
  } catch {
    return DEFAULT_POST_AUTH_PATH;
  }
}

const getFirstErrorMessage = (errors: FieldErrors): string | undefined => {
  for (const value of Object.values(errors)) {
    if (!value) {
      continue;
    }

    if (
      typeof value === "object" &&
      "message" in value &&
      typeof value.message === "string"
    ) {
      return value.message;
    }

    if (typeof value === "object") {
      const nestedMessage = getFirstErrorMessage(value as FieldErrors);
      if (nestedMessage) {
        return nestedMessage;
      }
    }
  }

  return undefined;
};

export default function AuthPage() {
  const { user, isLoading, loginMutation, registerMutation, guestLoginMutation } =
    useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [mode, setMode] = useState<AuthMode>(getInitialAuthMode);
  const [loaded, setLoaded] = useState(false);
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [showRegisterPassword, setShowRegisterPassword] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const postAuthRedirectPathRef = useRef<string>(getPostAuthRedirectPath());

  const loginForm = useForm<LoginUser>({
    defaultValues: {
      gmail: "",
      password: "",
    },
  });

  const registerForm = useForm<RegisterFormData>({
    defaultValues: {
      gmail: "",
      password: "",
      username: "",
      age: 18,
      gender: undefined,
    },
  });

  const guestForm = useForm<GuestFormData>({
    defaultValues: {
      username: "",
      age: 18,
      gender: "Male",
    },
  });

  useEffect(() => {
    if (user) {
      setLocation(postAuthRedirectPathRef.current, { replace: true });
    }
  }, [user, setLocation]);

  useEffect(() => {
    if (isLoading) {
      return;
    }

    const frame = window.requestAnimationFrame(() => setLoaded(true));
    return () => window.cancelAnimationFrame(frame);
  }, [isLoading]);

  useEffect(() => {
    if (!loaded || !containerRef.current) {
      return;
    }

    const animation = containerRef.current.animate(
      [
        { opacity: 0, transform: "translateY(24px) scale(0.98)" },
        { opacity: 1, transform: "translateY(0) scale(1)" },
      ],
      {
        duration: 650,
        easing: "cubic-bezier(0.16, 1, 0.3, 1)",
        fill: "forwards",
      },
    );

    return () => animation.cancel();
  }, [loaded]);

  if (user) {
    return null;
  }

  const resetMutations = () => {
    loginMutation.reset();
    registerMutation.reset();
    guestLoginMutation.reset();
  };

  const switchMode = (nextMode: AuthMode) => {
    if (
      loginMutation.isPending ||
      registerMutation.isPending ||
      guestLoginMutation.isPending
    ) {
      return;
    }

    resetMutations();
    setMode(nextMode);
  };

  const activeCopy = MODE_COPY[mode];
  const isBusy =
    loginMutation.isPending ||
    registerMutation.isPending ||
    guestLoginMutation.isPending;

  const handleLogin = (data: LoginUser) => {
    loginMutation.mutate(data);
  };

  const handleRegister = (data: RegisterFormData) => {
    if (!data.gender) {
      toast({
        title: "Check the form",
        description: "Please select your gender.",
        variant: "destructive",
      });
      return;
    }

    registerMutation.mutate({ ...data, gender: data.gender });
  };

  const handleGuestLogin = (data: GuestFormData) => {
    if (!data.gender) {
      toast({
        title: "Check the form",
        description: "Please select your gender.",
        variant: "destructive",
      });
      return;
    }

    guestLoginMutation.mutate({ ...data, gender: data.gender });
  };

  const handleValidationError = (errors: FieldErrors) => {
    const firstErrorMessage = getFirstErrorMessage(errors);

    if (!firstErrorMessage) {
      return;
    }

    toast({
      title: "Check the form",
      description: firstErrorMessage,
      variant: "destructive",
    });
  };

  const renderModeForm = () => {
    if (mode === "login") {
      return (
        <form
          onSubmit={loginForm.handleSubmit(handleLogin, handleValidationError)}
          className="space-y-4"
          data-testid="form-login"
        >
          <div className="space-y-3">
            <Label htmlFor="login-email" className="sr-only">
              Email
            </Label>
            <Input
              id="login-email"
              type="email"
              autoComplete="email"
              placeholder="Enter your email address"
              className={FIELD_CLASS_NAME}
              {...loginForm.register("gmail", {
                required: "Email is required.",
                pattern: {
                  value: EMAIL_PATTERN,
                  message: "Please enter a valid email address.",
                },
              })}
              data-testid="input-login-email"
            />
          </div>

          <div className="space-y-3">
            <Label htmlFor="login-password" className="sr-only">
              Password
            </Label>
            <div className="relative">
              <Input
                id="login-password"
                type={showLoginPassword ? "text" : "password"}
                autoComplete="current-password"
                placeholder="Password"
                className={cn(FIELD_CLASS_NAME, "pr-12")}
                {...loginForm.register("password", {
                  required: "Password is required.",
                })}
                data-testid="input-login-password"
              />
              <button
                type="button"
                onClick={() => setShowLoginPassword((current) => !current)}
                className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-white/45 transition-colors hover:text-white"
                aria-label={showLoginPassword ? "Hide password" : "Show password"}
              >
                {showLoginPassword ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </button>
            </div>
          </div>

          <Button
            type="submit"
            className={PRIMARY_BUTTON_CLASS_NAME}
            disabled={loginMutation.isPending}
            data-testid="button-login-submit"
          >
            {loginMutation.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : null}
            {activeCopy.primaryLabel}
          </Button>
        </form>
      );
    }

    if (mode === "register") {
      return (
        <form
          onSubmit={registerForm.handleSubmit(handleRegister, handleValidationError)}
          className="space-y-4"
          data-testid="form-register"
        >
          <div className="grid grid-cols-[minmax(0,1fr)_5rem] gap-3">
            <div className="min-w-0 space-y-3">
              <Label htmlFor="register-username" className="sr-only">
                Username
              </Label>
              <Input
                id="register-username"
                autoComplete="username"
                placeholder="Username"
                className={FIELD_CLASS_NAME}
                {...registerForm.register("username", {
                  required: "Username is required.",
                  minLength: {
                    value: 1,
                    message: "Username is required.",
                  },
                  maxLength: {
                    value: 50,
                    message: "Username must be 50 characters or fewer.",
                  },
                })}
                data-testid="input-register-username"
              />
            </div>

            <div className="space-y-3">
              <Label htmlFor="register-age" className="sr-only">
                Age
              </Label>
              <Input
                id="register-age"
                type="number"
                min={18}
                max={120}
                inputMode="numeric"
                placeholder="Age"
                className={FIELD_CLASS_NAME}
                {...registerForm.register("age", {
                  required: "Age is required.",
                  valueAsNumber: true,
                  min: {
                    value: 18,
                    message: "You must be at least 18 years old.",
                  },
                  max: {
                    value: 120,
                    message: "Please enter a valid age.",
                  },
                })}
                data-testid="input-register-age"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="register-email" className="sr-only">
              Email
            </Label>
            <Input
              id="register-email"
              type="email"
              autoComplete="email"
              placeholder="Enter your email address"
              className={FIELD_CLASS_NAME}
              {...registerForm.register("gmail", {
                required: "Email is required.",
                pattern: {
                  value: EMAIL_PATTERN,
                  message: "Please enter a valid email address.",
                },
              })}
              data-testid="input-register-email"
            />
          </div>

          <div className="grid grid-cols-[minmax(0,1fr)_7rem] gap-3">
            <div className="min-w-0 ">
              <Label htmlFor="register-password" className="sr-only">
                Password
              </Label>
              <div className="relative">
                <Input
                  id="register-password"
                  type={showRegisterPassword ? "text" : "password"}
                  autoComplete="new-password"
                  placeholder="Password"
                  className={cn(FIELD_CLASS_NAME, "pr-12")}
                  {...registerForm.register("password", {
                    required: "Password is required.",
                    minLength: {
                      value: 6,
                      message: "Password must be at least 6 characters.",
                    },
                  })}
                  data-testid="input-register-password"
                />
                <button
                  type="button"
                  onClick={() => setShowRegisterPassword((current) => !current)}
                  className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-white/45 transition-colors hover:text-white"
                  aria-label={
                    showRegisterPassword ? "Hide password" : "Show password"
                  }
                >
                  {showRegisterPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>

            <div className="">
              <Label htmlFor="register-gender" className="sr-only">
                Gender
              </Label>
              <Select
                value={registerForm.watch("gender")}
                onValueChange={(value) =>
                  registerForm.setValue("gender", value as GenderOption, {
                    shouldValidate: true,
                  })
                }
              >
                <SelectTrigger
                  id="register-gender"
                  className={cn(
                    FIELD_CLASS_NAME,
                    "justify-between data-[placeholder]:text-white/30",
                  )}
                  data-testid="select-register-gender"
                >
                  <SelectValue placeholder="Gender" />
                </SelectTrigger>
                <SelectContent className={SELECT_PANEL_CLASS_NAME}>
                  <SelectItem value="Male" className="focus:bg-white/10 focus:text-white">
                    Male
                  </SelectItem>
                  <SelectItem
                    value="Female"
                    className="focus:bg-white/10 focus:text-white"
                  >
                    Female
                  </SelectItem>
                  <SelectItem value="Other" className="focus:bg-white/10 focus:text-white">
                    Other
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <p className="text-center text-xs leading-5 text-white/45">
            I&apos;m at least 18 years old and have read and agree to the{" "}
            <Link
              href="/terms"
              className="text-white/72 transition-colors hover:text-white"
            >
              Terms of Service
            </Link>{" "}
            and{" "}
            <Link
              href="/privacy"
              className="text-white/72 transition-colors hover:text-white"
            >
              Privacy Policy
            </Link>
            .
          </p>

          <Button
            type="submit"
            className={PRIMARY_BUTTON_CLASS_NAME}
            disabled={registerMutation.isPending}
            data-testid="button-register-submit"
          >
            {registerMutation.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : null}
            {activeCopy.primaryLabel}
          </Button>
        </form>
      );
    }

    return (
      <form
        onSubmit={guestForm.handleSubmit(handleGuestLogin, handleValidationError)}
        className="space-y-4"
        data-testid="form-guest-login"
      >
        <div className="space-y-3">
          <Label htmlFor="guest-username" className="sr-only">
            Guest username
          </Label>
          <Input
            id="guest-username"
            autoComplete="nickname"
            placeholder="Choose a guest username"
            className={FIELD_CLASS_NAME}
            data-testid="input-guest-username"
            {...guestForm.register("username", {
              required: "Guest username is required.",
              minLength: {
                value: 2,
                message: "Guest username must be at least 2 characters.",
              },
              maxLength: {
                value: 20,
                message: "Guest username must be 20 characters or fewer.",
              },
            })}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="">
            <Label htmlFor="guest-age" className="sr-only">
              Age
            </Label>
            <Input
              id="guest-age"
              type="number"
              min={18}
              max={120}
              inputMode="numeric"
              placeholder="Age"
              className={FIELD_CLASS_NAME}
              data-testid="input-guest-age"
              {...guestForm.register("age", {
                required: "Age is required.",
                valueAsNumber: true,
                min: {
                  value: 18,
                  message: "You must be at least 18 years old.",
                },
                max: {
                  value: 120,
                  message: "Please enter a valid age.",
                },
              })}
            />
          </div>

          <div className="">
            <Label htmlFor="guest-gender" className="sr-only">
              Gender
            </Label>
            <Select
              value={guestForm.watch("gender")}
              onValueChange={(value) =>
                guestForm.setValue("gender", value as GenderOption, {
                  shouldValidate: true,
                })
              }
            >
              <SelectTrigger
                id="guest-gender"
                className={cn(
                  FIELD_CLASS_NAME,
                  "justify-between data-[placeholder]:text-white/30",
                )}
                data-testid="select-guest-gender"
              >
                <SelectValue placeholder="Gender" />
              </SelectTrigger>
              <SelectContent className={SELECT_PANEL_CLASS_NAME}>
                <SelectItem value="Male" className="focus:bg-white/10 focus:text-white">
                  Male
                </SelectItem>
                <SelectItem value="Female" className="focus:bg-white/10 focus:text-white">
                  Female
                </SelectItem>
                <SelectItem value="Other" className="focus:bg-white/10 focus:text-white">
                  Other
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <Button
          type="submit"
          className={PRIMARY_BUTTON_CLASS_NAME}
          disabled={guestLoginMutation.isPending}
          data-testid="button-guest-login"
        >
          {guestLoginMutation.isPending ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : null}
          {activeCopy.primaryLabel}
        </Button>
      </form>
    );
  };

  const guestToggleLabel =
    mode === "guest" ? "Sign in as Member" : "Login as Guest";
  const guestToggleTarget: AuthMode = mode === "guest" ? "login" : "guest";

  return (
    <>
      <Seo
        title="Login | ChatNexus"
        description={AUTH_SEO_DESCRIPTION}
        path="/auth"
      />
      <div className="auth-shell relative h-[100dvh] overflow-hidden bg-[#05080d] text-white">
        <div className="absolute inset-0" style={AUTH_BACKGROUND_STYLE} />
        <div
          className="absolute -top-28 right-[16%] h-[28rem] w-20 rotate-[28deg] blur-2xl opacity-60"
          style={AUTH_STREAK_PRIMARY_STYLE}
        />
        <div
          className="absolute -top-20 right-[26%] h-[20rem] w-14 rotate-[22deg] blur-2xl opacity-50"
          style={AUTH_STREAK_SECONDARY_STYLE}
        />
        <div className="absolute inset-x-0 top-0 h-40" style={AUTH_HEADER_GLOW_STYLE} />

        <div className="relative z-10 flex h-[100dvh] items-center justify-center px-4 py-4 sm:px-6 sm:py-5 lg:px-8 lg:py-4">
          <main className="flex h-full w-full items-center justify-center">
            <div
              ref={containerRef}
              className="relative flex h-full max-h-[calc(100dvh-2rem)] w-full max-w-[24rem] flex-col rounded-[2rem] border p-5 backdrop-blur-2xl sm:max-h-[calc(100dvh-2.5rem)] sm:p-7 lg:max-h-[calc(100dvh-2rem)] lg:p-6"
              style={AUTH_CARD_STYLE}
            >
              <Button
                asChild
                variant="ghost"
                aria-label="Close auth page"
                className="absolute right-4 top-4 z-10 h-10 w-10 rounded-full border border-white/10 bg-white/[0.05] p-0 text-white/70 backdrop-blur-md hover:bg-white/[0.08] hover:text-white"
                data-testid="button-auth-close"
              >
                <Link href="/">
                  <X className="h-4 w-4" />
                </Link>
              </Button>

              <div className="flex h-full flex-col overflow-y-auto px-1 pt-10 scrollbar-none sm:pt-9">
                <div className="mb-5 text-center">
                  <h1 className={AUTH_TITLE_CLASS_NAME}>
                    {activeCopy.title}
                  </h1>
                  <p className={AUTH_DESCRIPTION_CLASS_NAME}>
                    {activeCopy.description}
                  </p>
                </div>

                <div className="mb-5 grid grid-cols-2 gap-1 rounded-full border border-white/8 bg-white/[0.03] p-1">
                  {([
                    { id: "login", label: "Login", testId: "tab-login" },
                    { id: "register", label: "Sign up", testId: "tab-register" },
                  ] as const).map((item) => (
                    <Button
                      key={item.id}
                      type="button"
                      variant="ghost"
                      disabled={isBusy}
                      className={cn(
                        "h-9 rounded-full px-2 text-xs font-medium transition-colors",
                        mode === item.id
                          ? "bg-gradient-to-r from-[var(--brand-grad-start)] to-[var(--brand-grad-end)] text-black hover:brightness-105 hover:text-black"
                          : "text-white/60 hover:bg-white/[0.05] hover:text-white",
                      )}
                      onClick={() => switchMode(item.id)}
                      data-testid={item.testId}
                    >
                      {item.label}
                    </Button>
                  ))}
                </div>

                <div className="space-y-4">{renderModeForm()}</div>

                {showGuestToggleFooter(mode) ? (
                  <>
                    <div className="my-5 flex items-center gap-3">
                      <div className="h-px flex-1 bg-white/10" />
                      <span className="text-[11px] uppercase tracking-[0.18em] text-white/28">
                        Or
                      </span>
                      <div className="h-px flex-1 bg-white/10" />
                    </div>

                    <Button
                      type="button"
                      variant="ghost"
                      className="h-11 w-full rounded-[1rem] border border-white/10 bg-white/[0.06] text-sm font-medium text-white/75 hover:bg-white/[0.1] hover:text-white"
                      disabled={isBusy}
                      onClick={() => switchMode(guestToggleTarget)}
                      data-testid="link-guest-login"
                    >
                      {guestToggleLabel}
                    </Button>
                  </>
                ) : null}
              </div>
            </div>
          </main>
        </div>
      </div>
    </>
  );
}
