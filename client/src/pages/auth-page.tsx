import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/providers/auth-provider";
import { useLocation, Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Seo } from "@/components/seo";
import {
  CustomCursor,
  PagePreloader,
  AmbientOrbs,
  useParallax,
} from "@/components/effects";
import gsap from "gsap";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Loader2,
  ArrowLeft,
} from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  guestLoginSchema,
  registerUserSchema,
  loginUserSchema,
} from "@shared/schema";
import { z } from "zod";

const AUTH_SEO_DESCRIPTION =
  "Log in, register, or continue as a guest to start chatting on ChatNexus.";

export default function AuthPage() {
  const { user, isLoading, loginMutation, registerMutation, guestLoginMutation } =
    useAuth();
  const [, setLocation] = useLocation();
  const [activeTab, setActiveTab] = useState<"login" | "register">("login");
  const [isGuestMode, setIsGuestMode] = useState(false);

  const scrollY = useParallax();
  const [loaded, setLoaded] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Animate form in once preloader completes
  useEffect(() => {
    if (!loaded || !containerRef.current) return;
    gsap.fromTo(
      containerRef.current,
      { y: 40, opacity: 0, scale: 0.95 },
      {
        y: 0,
        opacity: 1,
        scale: 1,
        duration: 0.8,
        ease: "power3.out",
        delay: 0.2,
      },
    );
  }, [loaded]);

  // All hooks must be called before any conditional returns
  const loginForm = useForm<z.infer<typeof loginUserSchema>>({
    resolver: zodResolver(loginUserSchema),
    defaultValues: {
      gmail: "",
      password: "",
    },
  });

  const registerForm = useForm<z.infer<typeof registerUserSchema>>({
    resolver: zodResolver(registerUserSchema),
    defaultValues: {
      gmail: "",
      password: "",
      username: "",
      age: 18,
      gender: undefined,
    },
  });

  const guestForm = useForm<z.infer<typeof guestLoginSchema>>({
    resolver: zodResolver(guestLoginSchema),
    defaultValues: {
      username: "",
      age: 18,
      gender: undefined,
    },
  });

  // Redirect if already logged in - use useEffect to avoid calling setLocation during render
  useEffect(() => {
    if (user) {
      setLocation("/dashboard");
    }
  }, [user, setLocation]);

  // Show nothing while redirecting
  if (user) {
    return null;
  }

  const handleLogin = (data: z.infer<typeof loginUserSchema>) => {
    loginMutation.mutate(data);
  };

  const handleRegister = (data: z.infer<typeof registerUserSchema>) => {
    registerMutation.mutate(data);
  };

  const handleGuestLogin = (data: z.infer<typeof guestLoginSchema>) => {
    guestLoginMutation.mutate(data);
  };

  return (
    <>
      <Seo
        title="Login | ChatNexus"
        description={AUTH_SEO_DESCRIPTION}
        path="/auth"
      />
      <PagePreloader
        ready={!isLoading}
        onComplete={() => setLoaded(true)}
      />
      <div className="landing-root min-h-screen">
        <CustomCursor />
        <AmbientOrbs scrollY={scrollY} />

        {/* Floating Back Button */}
        <div className="fixed top-6 left-6 z-50">
          <Link href="/">
            <Button
              variant="ghost"
              className="text-brand-text hover:bg-brand-primary/10 rounded-full gap-2 px-4 shadow-[0_0_15px_var(--brand-glow-primary)] border border-brand-border backdrop-blur-md"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Home
            </Button>
          </Link>
        </div>

        <div
          ref={containerRef}
          className="relative z-10 min-h-screen w-full"
          style={{ opacity: 0 }}
        >
          <div className="grid min-h-screen grid-cols-1 lg:grid-cols-2">
            <section className="hidden lg:flex flex-col justify-between border-r border-border bg-muted px-12 py-14 text-foreground dark:bg-[#020913] dark:text-white">
              <div className="flex items-center gap-3">
                <img
                  src="/assets/images/image.png"
                  alt="ChatNexus Logo"
                  className="h-12 w-auto object-contain"
                />
                <span className="text-2xl font-bold tracking-tight">ChatNexus</span>
              </div>
              <div className="max-w-md space-y-8">
                <h1 className="text-5xl font-extrabold leading-tight tracking-tight">
                  Meet strangers. Start conversations. Stay anonymous.
                </h1>
                <p className="text-base text-muted-foreground dark:text-white/70">
                  ChatNexus connects you with real people for real-time
                  conversations — no long signup, no data harvesting. Just
                  fast, secure, anonymous chat.
                </p>
                <div className="flex gap-6 text-sm text-muted-foreground dark:text-white/50">
                  <div className="flex flex-col">
                    <span className="text-2xl font-bold text-foreground dark:text-white">10K+</span>
                    <span>Active users</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-2xl font-bold text-foreground dark:text-white">1M+</span>
                    <span>Messages sent</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-2xl font-bold text-foreground dark:text-white">&lt;50ms</span>
                    <span>Latency</span>
                  </div>
                </div>
              </div>
            </section>

            <section className="flex min-h-screen items-center justify-center border-l border-border bg-background/95 px-6 py-10 sm:px-10 dark:bg-[#12161e]/95">
              <div className="w-full max-w-md space-y-6">
                <div className="space-y-2">
                  <h2 className="text-3xl font-semibold text-foreground dark:text-white">
                    {isGuestMode
                      ? "Continue as guest"
                      : activeTab === "login"
                      ? "Log into ChatNexus"
                      : "Create your account"}
                  </h2>
                  <p className="text-sm text-muted-foreground dark:text-white/60">
                    {isGuestMode
                      ? "Pick a guest username, age, and gender to start chatting immediately."
                      : activeTab === "login"
                      ? "Continue your conversations."
                      : "Start chatting with people worldwide."}
                  </p>
                </div>

                <div className="grid grid-cols-2 rounded-xl border border-border bg-muted/70 p-1 dark:border-white/15 dark:bg-white/5">
                  <Button
                    type="button"
                    variant={activeTab === "login" ? "default" : "ghost"}
                    className={`rounded-lg ${activeTab === "login" ? "bg-[#0f4b91] text-white hover:bg-[#0f4b91]" : "text-muted-foreground hover:bg-muted hover:text-foreground dark:text-white/70 dark:hover:bg-white/10 dark:hover:text-white"}`}
                    onClick={() => {
                      setActiveTab("login");
                      setIsGuestMode(false);
                    }}
                    data-testid="tab-login"
                  >
                    Login
                  </Button>
                  <Button
                    type="button"
                    variant={activeTab === "register" ? "default" : "ghost"}
                    className={`rounded-lg ${activeTab === "register" ? "bg-[#0f4b91] text-white hover:bg-[#0f4b91]" : "text-muted-foreground hover:bg-muted hover:text-foreground dark:text-white/70 dark:hover:bg-white/10 dark:hover:text-white"}`}
                    onClick={() => {
                      setActiveTab("register");
                      setIsGuestMode(false);
                    }}
                    data-testid="tab-register"
                  >
                    Register
                  </Button>
                </div>

                {activeTab === "login" && !isGuestMode && (
                  <form
                    onSubmit={loginForm.handleSubmit(handleLogin)}
                    className="space-y-4"
                    data-testid="form-login"
                  >
                    <div className="space-y-2">
                      <Label htmlFor="login-email" className="text-muted-foreground dark:text-white/80">
                        Mobile number, username or email
                      </Label>
                      <Input
                        id="login-email"
                        type="email"
                        className="h-12 rounded-xl border-border bg-background text-foreground placeholder:text-muted-foreground focus-visible:ring-primary dark:border-white/15 dark:bg-transparent dark:text-white dark:placeholder:text-white/40"
                        placeholder="Mobile number, username or email"
                        {...loginForm.register("gmail")}
                        data-testid="input-login-email"
                      />
                      {loginForm.formState.errors.gmail && (
                        <p className="text-sm text-destructive">
                          {loginForm.formState.errors.gmail.message}
                        </p>
                      )}
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="login-password" className="text-muted-foreground dark:text-white/80">
                        Password
                      </Label>
                      <Input
                        id="login-password"
                        type="password"
                        className="h-12 rounded-xl border-border bg-background text-foreground placeholder:text-muted-foreground focus-visible:ring-primary dark:border-white/15 dark:bg-transparent dark:text-white dark:placeholder:text-white/40"
                        placeholder="Password"
                        {...loginForm.register("password")}
                        data-testid="input-login-password"
                      />
                      {loginForm.formState.errors.password && (
                        <p className="text-sm text-destructive">
                          {loginForm.formState.errors.password.message}
                        </p>
                      )}
                    </div>
                    <Button
                      type="submit"
                      className="h-12 w-full rounded-full bg-[#0f4b91] text-white hover:bg-[#0f4b91]/90"
                      disabled={loginMutation.isPending}
                      data-testid="button-login-submit"
                    >
                      {loginMutation.isPending ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : null}
                      Log in
                    </Button>
                  </form>
                )}

                {activeTab === "login" && isGuestMode && (
                  <form
                    onSubmit={guestForm.handleSubmit(handleGuestLogin)}
                    className="space-y-4"
                    data-testid="form-guest-login"
                  >
                    <div className="grid grid-cols-2 gap-4">
                      <div className="col-span-2 space-y-2">
                        <Label htmlFor="guest-username" className="text-muted-foreground dark:text-white/80">
                          Guest username
                        </Label>
                        <Input
                          id="guest-username"
                          placeholder="Choose a guest username"
                          className="h-12 rounded-xl border-border bg-background text-foreground placeholder:text-muted-foreground focus-visible:ring-primary dark:border-white/15 dark:bg-transparent dark:text-white dark:placeholder:text-white/40"
                          data-testid="input-guest-username"
                          autoFocus
                          {...guestForm.register("username")}
                        />
                        {guestForm.formState.errors.username && (
                          <p className="text-sm text-destructive">
                            {guestForm.formState.errors.username.message}
                          </p>
                        )}
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="guest-age" className="text-muted-foreground dark:text-white/80">
                          Age
                        </Label>
                        <Input
                          id="guest-age"
                          type="number"
                          min={13}
                          max={120}
                          placeholder="Age"
                          className="h-12 rounded-xl border-border bg-background text-foreground placeholder:text-muted-foreground focus-visible:ring-primary dark:border-white/15 dark:bg-transparent dark:text-white dark:placeholder:text-white/40"
                          data-testid="input-guest-age"
                          {...guestForm.register("age", { valueAsNumber: true })}
                        />
                        {guestForm.formState.errors.age && (
                          <p className="text-sm text-destructive">
                            {guestForm.formState.errors.age.message}
                          </p>
                        )}
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="guest-gender" className="text-muted-foreground dark:text-white/80">
                          Gender
                        </Label>
                        <Select
                          onValueChange={(value) =>
                            guestForm.setValue("gender", value as any, {
                              shouldValidate: true,
                            })
                          }
                          value={guestForm.watch("gender")}
                        >
                          <SelectTrigger
                            id="guest-gender"
                            className="h-12 rounded-xl border-border bg-background text-foreground dark:border-white/15 dark:bg-transparent dark:text-white"
                            data-testid="select-guest-gender"
                          >
                            <SelectValue placeholder="Select gender" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Male">Male</SelectItem>
                            <SelectItem value="Female">Female</SelectItem>
                            <SelectItem value="Other">Other</SelectItem>
                          </SelectContent>
                        </Select>
                        {guestForm.formState.errors.gender && (
                          <p className="text-sm text-destructive">
                            {guestForm.formState.errors.gender.message}
                          </p>
                        )}
                      </div>
                    </div>
                    <Button
                      type="submit"
                      className="h-12 w-full rounded-full bg-[#0f4b91] text-white hover:bg-[#0f4b91]/90"
                      disabled={
                        guestLoginMutation.isPending
                      }
                      data-testid="button-guest-login"
                    >
                      {guestLoginMutation.isPending ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : null}
                      Continue as guest
                    </Button>
                  </form>
                )}

                {activeTab === "register" && (
                  <form
                    onSubmit={registerForm.handleSubmit(handleRegister)}
                    className="space-y-4"
                    data-testid="form-register"
                  >
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="register-username" className="text-muted-foreground dark:text-white/80">
                          Username
                        </Label>
                        <Input
                          id="register-username"
                          placeholder="Username"
                          className="h-12 rounded-xl border-border bg-background text-foreground placeholder:text-muted-foreground focus-visible:ring-primary dark:border-white/15 dark:bg-transparent dark:text-white dark:placeholder:text-white/40"
                          {...registerForm.register("username")}
                          data-testid="input-register-username"
                        />
                        {registerForm.formState.errors.username && (
                          <p className="text-sm text-destructive">
                            {registerForm.formState.errors.username.message}
                          </p>
                        )}
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="register-age" className="text-muted-foreground dark:text-white/80">
                          Age
                        </Label>
                        <Input
                          id="register-age"
                          type="number"
                          min={13}
                          max={120}
                          placeholder="Age"
                          className="h-12 rounded-xl border-border bg-background text-foreground placeholder:text-muted-foreground focus-visible:ring-primary dark:border-white/15 dark:bg-transparent dark:text-white dark:placeholder:text-white/40"
                          {...registerForm.register("age", { valueAsNumber: true })}
                          data-testid="input-register-age"
                        />
                        {registerForm.formState.errors.age && (
                          <p className="text-sm text-destructive">
                            {registerForm.formState.errors.age.message}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="register-email" className="text-muted-foreground dark:text-white/80">
                        Email
                      </Label>
                      <Input
                        id="register-email"
                        type="email"
                        placeholder="you@example.com"
                        className="h-12 rounded-xl border-border bg-background text-foreground placeholder:text-muted-foreground focus-visible:ring-primary dark:border-white/15 dark:bg-transparent dark:text-white dark:placeholder:text-white/40"
                        {...registerForm.register("gmail")}
                        data-testid="input-register-email"
                      />
                      {registerForm.formState.errors.gmail && (
                        <p className="text-sm text-destructive">
                          {registerForm.formState.errors.gmail.message}
                        </p>
                      )}
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="register-gender" className="text-muted-foreground dark:text-white/80">
                        Gender
                      </Label>
                      <Select
                        onValueChange={(value) =>
                          registerForm.setValue("gender", value as any)
                        }
                        data-testid="select-register-gender"
                      >
                        <SelectTrigger className="h-12 rounded-xl border-border bg-background text-foreground dark:border-white/15 dark:bg-transparent dark:text-white">
                          <SelectValue placeholder="Select gender" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Male">Male</SelectItem>
                          <SelectItem value="Female">Female</SelectItem>
                          <SelectItem value="Other">Other</SelectItem>
                        </SelectContent>
                      </Select>
                      {registerForm.formState.errors.gender && (
                        <p className="text-sm text-destructive">
                          {registerForm.formState.errors.gender.message}
                        </p>
                      )}
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="register-password" className="text-muted-foreground dark:text-white/80">
                        Password
                      </Label>
                      <Input
                        id="register-password"
                        type="password"
                        placeholder="Create a strong password"
                        className="h-12 rounded-xl border-border bg-background text-foreground placeholder:text-muted-foreground focus-visible:ring-primary dark:border-white/15 dark:bg-transparent dark:text-white dark:placeholder:text-white/40"
                        {...registerForm.register("password")}
                        data-testid="input-register-password"
                      />
                      {registerForm.formState.errors.password && (
                        <p className="text-sm text-destructive">
                          {registerForm.formState.errors.password.message}
                        </p>
                      )}
                    </div>
                    <Button
                      type="submit"
                      className="h-12 w-full rounded-full bg-[#0f4b91] text-white hover:bg-[#0f4b91]/90"
                      disabled={registerMutation.isPending}
                      data-testid="button-register-submit"
                    >
                      {registerMutation.isPending ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : null}
                      Create account
                    </Button>
                  </form>
                )}

                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-border dark:border-white/15" />
                  </div>
                  <span className="relative mx-auto block w-fit bg-background px-3 text-xs uppercase tracking-[0.14em] text-muted-foreground dark:bg-[#12161e] dark:text-white/40">
                    or
                  </span>
                </div>

                <Button
                  type="button"
                  className="h-11 w-full rounded-full border border-border bg-transparent text-foreground hover:bg-muted/60 dark:border-white/15 dark:text-white dark:hover:bg-white/10"
                  onClick={() => {
                    setActiveTab("login");
                    setIsGuestMode(true);
                  }}
                  data-testid="link-guest-login"
                >
                  Continue as guest
                </Button>

                <p className="text-center text-sm text-muted-foreground dark:text-white/55">
                  By continuing, you agree to our{" "}
                  <Link href="/terms" className="underline hover:text-foreground dark:hover:text-white transition-colors">Terms of Service</Link>{" "}
                  and{" "}
                  <Link href="/privacy" className="underline hover:text-foreground dark:hover:text-white transition-colors">Privacy Policy</Link>.
                </p>
              </div>
            </section>
          </div>
        </div>
      </div>
    </>
  );
}
