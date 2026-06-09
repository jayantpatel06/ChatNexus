import { Seo } from "@/components/seo";
import PageFooter from "@/components/page-footer";
import SiteNav from "@/components/site-nav";
import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";

export default function BlogPage() {
  return (
    <div className="flex flex-col min-h-screen bg-background">
      <Seo
        title="Blog | ChatNexus"
        description="Read the latest news, guides, and articles from the ChatNexus team."
        path="/blog"
      />

      <SiteNav />

      <main className="flex-1 w-full max-w-5xl mx-auto px-4 py-24 md:py-32">
        <div className="mb-12">
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-foreground mb-4">
            ChatNexus Blog
          </h1>
          <p className="text-xl text-muted-foreground max-w-2xl">
            Insights, updates, and guides on privacy, social connections, and the future of random chat.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <Card className="border-border shadow-sm bg-card hover:border-primary/50 transition-colors">
            <CardContent className="pt-6">
              <div className="text-sm text-primary font-medium mb-2">Guides</div>
              <h2 className="text-xl font-bold text-foreground mb-3 leading-tight">
                <Link href="/stranger-chat">
                  How to Stay Safe While Talking to Strangers Online
                </Link>
              </h2>
              <p className="text-sm text-muted-foreground mb-4 line-clamp-3">
                A comprehensive guide on maintaining your privacy and safety while enjoying anonymous chat rooms and random video alternatives.
              </p>
              <span className="text-xs text-muted-foreground">Coming Soon</span>
            </CardContent>
          </Card>

          <Card className="border-border shadow-sm bg-card hover:border-primary/50 transition-colors">
            <CardContent className="pt-6">
              <div className="text-sm text-primary font-medium mb-2">Updates</div>
              <h2 className="text-xl font-bold text-foreground mb-3 leading-tight">
                <Link href="/features">
                  Introducing the Global Chat Room: Sub-50ms Message Delivery
                </Link>
              </h2>
              <p className="text-sm text-muted-foreground mb-4 line-clamp-3">
                Learn about the engineering behind our WebSocket infrastructure that powers thousands of concurrent users in real-time.
              </p>
              <span className="text-xs text-muted-foreground">Coming Soon</span>
            </CardContent>
          </Card>

          <Card className="border-border shadow-sm bg-card hover:border-primary/50 transition-colors">
            <CardContent className="pt-6">
              <div className="text-sm text-primary font-medium mb-2">Industry</div>
              <h2 className="text-xl font-bold text-foreground mb-3 leading-tight">
                <Link href="/omegle-alternative">
                  Life After Omegle: The Rise of Text-First Random Chat
                </Link>
              </h2>
              <p className="text-sm text-muted-foreground mb-4 line-clamp-3">
                Why users are moving away from webcam-forced platforms in favor of text-first, privacy-focused alternatives like ChatNexus.
              </p>
              <span className="text-xs text-muted-foreground">Coming Soon</span>
            </CardContent>
          </Card>
        </div>
      </main>

      <PageFooter />
    </div>
  );
}
