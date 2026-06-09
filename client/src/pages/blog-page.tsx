import { Seo } from "@/components/seo";
import PageFooter from "@/components/page-footer";
import SiteNav from "@/components/site-nav";
import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { BLOG_POSTS } from "@/lib/blog-data";
import { ArrowRight } from "lucide-react";

export default function BlogPage() {
  return (
    <div className="flex flex-col min-h-screen bg-background">
      <Seo
        title="Blog | ChatNexus"
        description="Read the latest news, guides, and articles from the ChatNexus team on random chat and online safety."
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
          {BLOG_POSTS.map((post) => (
            <Link key={post.slug} href={`/blog/${post.slug}`}>
              <Card className="h-full border-border shadow-sm bg-card hover:border-brand-primary/50 transition-colors group cursor-pointer">
                <CardContent className="p-6 flex flex-col h-full">
                  <div className="text-xs text-brand-primary font-bold tracking-wider uppercase mb-3">
                    {post.category}
                  </div>
                  <h2 className="text-xl font-bold text-foreground mb-3 leading-tight group-hover:text-brand-primary transition-colors">
                    {post.title}
                  </h2>
                  <p className="text-sm text-muted-foreground mb-6 line-clamp-3 flex-1">
                    {post.excerpt}
                  </p>
                  <div className="flex items-center justify-between mt-auto pt-4 border-t border-border/50">
                    <span className="text-xs text-muted-foreground font-medium">
                      {new Date(post.date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                    </span>
                    <span className="flex items-center text-xs font-semibold text-brand-primary">
                      Read Article <ArrowRight className="ml-1 h-3 w-3" />
                    </span>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </main>

      <PageFooter />
    </div>
  );
}
