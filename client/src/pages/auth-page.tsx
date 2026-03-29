import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useLocation, Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CardContent } from "@/components/ui/card";
import { Seo } from "@/components/seo";
import {
  CustomCursor,
  PagePreloader,
  AmbientOrbs,
  TiltCard,
  MagneticWrap,
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
import { MessageCircle, Loader2, KeyRound, Mail, User, ArrowLeft } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { registerUserSchema, loginUserSchema } from "@shared/schema";
import { z } from "zod";

export default function AuthPage() {
  const { user, loginMutation, registerMutation, guestLoginMutation } =
    useAuth();
  const [, setLocation] = useLocation();
  const [activeTab, setActiveTab] = useState<"login" | "register">("login");
  const [guestUsername, setGuestUsername] = useState("");
  const [showGuestCard, setShowGuestCard] = useState(false);
  
  const scrollY = useParallax();
  const [loaded, setLoaded] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Animate form in once preloader completes
  useEffect(() => {
    if (!loaded || !containerRef.current) return;
    gsap.fromTo(
      containerRef.current,
      { y: 40, opacity: 0, scale: 0.95 },
      { y: 0, opacity: 1, scale: 1, duration: 0.8, ease: "power3.out", delay: 0.2 }
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

  const handleGuestLogin = () => {
    if (!guestUsername.trim()) return;
    guestLoginMutation.mutate(guestUsername);
  };

  return (
    <>
      <Seo
        title="Login | ChatNexus"
        description="Sign in or continue as a guest to access ChatNexus."
        path="/auth"
        robots="noindex, nofollow"
      />
      <PagePreloader onComplete={() => setLoaded(true)} />
      <div className="landing-root min-h-screen flex items-center justify-center p-4">
        <CustomCursor />
        <AmbientOrbs scrollY={scrollY} />

        {/* Floating Back Button */}
        <div className="fixed top-6 left-6 z-50">
          <MagneticWrap>
            <Link href="/">
              <Button variant="ghost" className="text-brand-text hover:bg-brand-primary/10 rounded-full gap-2 px-4 shadow-[0_0_15px_var(--brand-glow-primary)] border border-brand-border backdrop-blur-md">
                <ArrowLeft className="w-4 h-4" />
                Back to Home
              </Button>
            </Link>
          </MagneticWrap>
        </div>

        <div ref={containerRef} className="w-full max-w-md relative z-10" style={{ opacity: 0 }}>
          {/* Logo/Brand */}
          <div className="text-center mb-4">
            <h1 className="text-4xl font-extrabold text-brand-text tracking-tight mb-2">ChatNexus</h1>
            <p className="text-brand-muted text-base">
              Connect and Chat in Real-time with Strangers
            </p>
          </div>

          {/* Auth Card */}
          <TiltCard className="w-full shadow-2xl">
          <CardContent className="p-6">
            {/* Tab Navigation */}
            <div className="flex bg-brand-sidebar/50 rounded-lg p-1 border border-brand-border">
              <Button
                variant={activeTab === "login" ? "default" : "ghost"}
                className={`flex-1 transition-all rounded-md ${activeTab === "login" ? "bg-brand-primary text-black shadow-lg" : "text-brand-muted hover:text-brand-text"}`}
                onClick={() => setActiveTab("login")}
                data-testid="tab-login"
              >
                Login
              </Button>
              <Button
                variant={activeTab === "register" ? "default" : "ghost"}
                className={`flex-1 transition-all rounded-md ${activeTab === "register" ? "bg-brand-primary text-black shadow-lg" : "text-brand-muted hover:text-brand-text"}`}
                onClick={() => setActiveTab("register")}
                data-testid="tab-register"
              >
                Register
              </Button>
            </div>

            {/* Guest Login Link and Card */}
            <div className="flex flex-col items-center">
              <Button
                type="button"
                variant={undefined}
                className="w-full mt-2 bg-transparent border border-brand-border hover:bg-brand-primary/10 text-brand-text transition-all"
                onClick={() => setShowGuestCard(true)}
                data-testid="link-guest-login"
              >
                Login as Guest
              </Button>
            </div>
            {showGuestCard && (
              <div className="mb-4 mt-4 p-4 bg-brand-sidebar/40 rounded-lg border border-brand-border animate-fade-in backdrop-blur-sm">
                <div className="space-y-3">
                  <div>
                    <Label htmlFor="guest-username" className="sr-only">
                      Guest Username
                    </Label>
                    <Input
                      id="guest-username"
                      placeholder="Choose a guest username"
                      value={guestUsername}
                      onChange={(e) => setGuestUsername(e.target.value)}
                      className="bg-brand-card border-brand-border text-brand-text placeholder:text-brand-muted focus:ring-brand-primary/20"
                      data-testid="input-guest-username"
                      autoFocus
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="secondary"
                      className="w-full hover:scale-105 transition-transform"
                      onClick={handleGuestLogin}
                      disabled={
                        guestLoginMutation.isPending || !guestUsername.trim()
                      }
                      data-testid="button-guest-login"
                    >
                      {guestLoginMutation.isPending ? (
                        <Loader2 className="w-4 h-4 animate-spin mr-2" />
                      ) : null}
                      Continue as Guest
                    </Button>
                    <Button
                      variant="ghost"
                      className="flex-0"
                      onClick={() => setShowGuestCard(false)}
                      data-testid="button-guest-cancel"
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              </div>
            )}

            <div className="relative mb-6 ">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-border"></div>
              </div>
            </div>

            {/* Login Form */}
            {activeTab === "login" && (
              <form
                onSubmit={loginForm.handleSubmit(handleLogin)}
                className="space-y-4"
                data-testid="form-login"
              >
                <div className="space-y-2">
                  <Label htmlFor="login-email" className="auth-label">Email</Label>
                  <Input
                    id="login-email"
                    type="email"
                    className="auth-input"
                    placeholder="Enter your Gmail address"
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
                  <Label htmlFor="login-password" className="auth-label">Password</Label>
                  <Input
                    id="login-password"
                    type="password"
                    className="auth-input"
                    placeholder="Enter your password"
                    {...loginForm.register("password")}
                    data-testid="input-login-password"
                  />
                  {loginForm.formState.errors.password && (
                    <p className="text-sm text-destructive">
                      {loginForm.formState.errors.password.message}
                    </p>
                  )}
                </div>
                <MagneticWrap className="w-full mt-2">
                  <button
                    type="submit"
                    className="hero-btn-primary w-full justify-center"
                    disabled={loginMutation.isPending}
                    data-testid="button-login-submit"
                  >
                    {loginMutation.isPending ? (
                      <Loader2 className="w-5 h-5 animate-spin mr-2" />
                    ) : null}
                    <span>Sign In</span>
                  </button>
                </MagneticWrap>
              </form>
            )}

            {/* Register Form */}
            {activeTab === "register" && (
              <form
                onSubmit={registerForm.handleSubmit(handleRegister)}
                className="space-y-4"
                data-testid="form-register"
              >
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="register-username">Username</Label>
                    <Input
                      id="register-username"
                      placeholder="Choose username"
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
                    <Label htmlFor="register-age">Age</Label>
                    <Input
                      id="register-age"
                      type="number"
                      min={13}
                      max={120}
                      placeholder="Age"
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
                  <Label htmlFor="register-email">Gmail Address</Label>
                  <Input
                    id="register-email"
                    type="email"
                    placeholder="your.email@gmail.com"
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
                  <Label htmlFor="register-gender">Gender</Label>
                  <Select
                    onValueChange={(value) =>
                      registerForm.setValue("gender", value as any)
                    }
                    data-testid="select-register-gender"
                  >
                    <SelectTrigger>
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
                  <Label htmlFor="register-password">Password</Label>
                  <Input
                    id="register-password"
                    type="password"
                    placeholder="Create a strong password"
                    {...registerForm.register("password")}
                    data-testid="input-register-password"
                  />
                  {registerForm.formState.errors.password && (
                    <p className="text-sm text-destructive">
                      {registerForm.formState.errors.password.message}
                    </p>
                  )}
                </div>
                <MagneticWrap className="w-full mt-4">
                  <button
                    type="submit"
                    className="hero-btn-primary w-full justify-center"
                    disabled={registerMutation.isPending}
                    data-testid="button-register-submit"
                  >
                    {registerMutation.isPending ? (
                      <Loader2 className="w-5 h-5 animate-spin mr-2" />
                    ) : null}
                    <span>Create Account</span>
                  </button>
                </MagneticWrap>
              </form>
            )}
          </CardContent>
        </TiltCard>

        <p className="text-center text-sm text-white/50 mt-8">
          By continuing, you agree to our Terms of Service and Privacy Policy
        </p>
      </div>
      </div>
    </>
  );
}
