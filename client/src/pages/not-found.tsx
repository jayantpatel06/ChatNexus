import { Card, CardContent } from "@/components/ui/card";
import { AlertCircle } from "lucide-react";
import { Seo } from "@/components/seo";

export default function NotFound() {
  return (
    <>
      <Seo
        title="Page Not Found | ChatNexus"
        description="The requested page could not be found."
        robots="noindex, nofollow"
      />
      <div className="min-h-screen w-full flex items-center justify-center bg-background px-4">
        <Card className="w-full max-w-md border-border shadow-md">
          <CardContent className="pt-6">
            <div className="flex mb-4 gap-2">
              <AlertCircle className="h-8 w-8 text-destructive" />
              <h1 className="text-2xl font-bold text-foreground">404 Page Not Found</h1>
            </div>

            <p className="mt-4 text-sm text-muted-foreground">
              Did you forget to add the page to the router?
            </p>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
