import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MessageCircle, Loader2 } from "lucide-react";
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
      setLocation("/");
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
    <div className="min-h-screen bg-gradient-to-br from-primary/5 to-accent/5 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo/Brand */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-primary rounded-full mb-4">
            <MessageCircle className="w-8 h-8 text-primary-foreground" />
          </div>
          <h1 className="text-3xl font-bold text-white">ChatNexus</h1>
          <p className="text-white">Connect and chat in real-time</p>
        </div>

        {/* Auth Card */}
        <Card className="shadow-lg">
          <CardContent className="p-6">
            {/* Tab Navigation */}
            <div className="flex mb-6 bg-secondary rounded-lg p-1">
              <Button
                variant={activeTab === "login" ? "default" : "ghost"}
                className={`flex-1 ${activeTab === "login" ? "bg-card text-foreground shadow-sm" : "text-white"}`}
                onClick={() => setActiveTab("login")}
                data-testid="tab-login"
              >
                Login
              </Button>
              <Button
                variant={activeTab === "register" ? "default" : "ghost"}
                className={`flex-1 ${activeTab === "register" ? "bg-card text-foreground shadow-sm" : "text-white"}`}
                onClick={() => setActiveTab("register")}
                data-testid="tab-register"
              >
                Register
              </Button>
            </div>

            {/* Guest Login Section */}
            <div className="mb-6 p-4 bg-muted/50 rounded-lg border border-border">
              <h3 className="font-medium text-foreground mb-2 text-center">
                Quick Access
              </h3>
              <p className="text-sm text-muted-foreground mb-3 text-center">
                Join instantly as a guest
              </p>

              <div className="space-y-3">
                <div className="space-y-2">
                  <Label htmlFor="guest-username" className="sr-only">
                    Guest Username
                  </Label>
                  <Input
                    id="guest-username"
                    placeholder="Choose a guest username"
                    value={guestUsername}
                    onChange={(e) => setGuestUsername(e.target.value)}
                    className="bg-background"
                    data-testid="input-guest-username"
                  />
                </div>

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
              </div>
            </div>

            <div className="relative mb-6">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-border"></div>
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="bg-card px-4 text-muted-foreground">
                  or continue with account
                </span>
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
                  <Label htmlFor="login-email">Email</Label>
                  <Input
                    id="login-email"
                    type="email"
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
                  <Label htmlFor="login-password">Password</Label>
                  <Input
                    id="login-password"
                    type="password"
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
                <Button
                  type="submit"
                  className="w-full hover:scale-105 transition-transform"
                  disabled={loginMutation.isPending}
                  data-testid="button-login-submit"
                >
                  {loginMutation.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  ) : null}
                  Sign In
                </Button>
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
                <Button
                  type="submit"
                  className="w-full hover:scale-105 transition-transform"
                  disabled={registerMutation.isPending}
                  data-testid="button-register-submit"
                >
                  {registerMutation.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  ) : null}
                  Create Account
                </Button>
              </form>
            )}
          </CardContent>
        </Card>

        <p className="text-center text-sm text-white mt-6">
          By continuing, you agree to our Terms of Service and Privacy Policy
        </p>
      </div>
    </div>
  );
}
