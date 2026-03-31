import { AlertCircle } from "lucide-react";
import { Link, useLocation } from "wouter";
import { Seo } from "@/components/seo";
import { Card, CardContent } from "@/components/ui/card";

const NOT_FOUND_PAGE = {
  title: "Page Not Found | ChatNexus",
  description: "The requested page could not be found.",
  robots: "noindex, nofollow",
  heading: "404 Page Not Found",
  message: "The page you requested does not exist or may have moved.",
} as const;

export default function NotFoundPage() {
  const [location] = useLocation();

  return (
    <>
      <Seo
        title={NOT_FOUND_PAGE.title}
        description={NOT_FOUND_PAGE.description}
        path={location}
        robots={NOT_FOUND_PAGE.robots}
      />
      <div className="min-h-screen w-full flex items-center justify-center bg-background px-4">
        <Card className="w-full max-w-md border-border shadow-md">
          <CardContent className="pt-6">
            <div className="flex mb-4 gap-2">
              <AlertCircle className="h-8 w-8 text-destructive" />
              <h1 className="text-2xl font-bold text-foreground">
                {NOT_FOUND_PAGE.heading}
              </h1>
            </div>

            <p className="mt-4 text-sm text-muted-foreground">
              {NOT_FOUND_PAGE.message}
            </p>

            <p className="mt-6 text-sm">
              <Link href="/" className="text-primary underline underline-offset-4">
                Return to the ChatNexus homepage
              </Link>
            </p>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
