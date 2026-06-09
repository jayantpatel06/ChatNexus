import { type ReactNode } from "react";
import { Link } from "wouter";
import { ArrowLeft, Calendar, Clock, User } from "lucide-react";
import { Seo } from "@/components/seo";
import PageFooter from "@/components/page-footer";
import SiteNav from "@/components/site-nav";
import { CustomCursor } from "@/components/effects";
import type { BlogPostMetadata } from "@/lib/blog-data";

export default function BlogLayout({
  post,
  children,
}: {
  post: BlogPostMetadata;
  children: ReactNode;
}) {
  const formattedDate = new Date(post.date).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  return (
    <>
      <Seo
        title={`${post.title} | ChatNexus Blog`}
        description={post.excerpt}
        path={`/blog/${post.slug}`}
        keywords={post.targetKeyword}
        // The Article Schema is injected automatically via server/seo.ts based on the path
      />
      <div className="landing-root bg-background">
        <CustomCursor />
        <SiteNav />

        <article className="w-full max-w-3xl mx-auto px-4 py-24 md:py-32">
          {/* Breadcrumbs & Back Link */}
          <div className="mb-8">
            <Link
              href="/blog"
              className="inline-flex items-center text-sm font-medium text-muted-foreground hover:text-brand-primary transition-colors"
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Blog
            </Link>
          </div>

          {/* Article Header */}
          <header className="mb-12 border-b border-border pb-8">
            <div className="mb-4 inline-block rounded-full bg-brand-primary/10 px-3 py-1 text-xs font-semibold tracking-wide text-brand-primary uppercase">
              {post.category}
            </div>
            <h1 className="text-3xl md:text-5xl font-extrabold tracking-tight text-foreground leading-tight mb-6" style={{ fontFamily: "var(--landing-font-display)" }}>
              {post.title}
            </h1>
            
            <div className="flex flex-wrap items-center gap-6 text-sm text-muted-foreground">
              <div className="flex items-center gap-2">
                <User className="h-4 w-4" />
                <span>{post.author}</span>
              </div>
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                <time dateTime={post.date}>{formattedDate}</time>
              </div>
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4" />
                <span>{post.readingTime}</span>
              </div>
            </div>
          </header>

          {/* Article Content */}
          <div className="prose prose-zinc dark:prose-invert max-w-none text-brand-text prose-headings:font-bold prose-headings:text-foreground prose-a:text-brand-primary hover:prose-a:text-brand-accent prose-img:rounded-2xl prose-img:border prose-img:border-border">
            {children}
          </div>

          {/* Article Footer CTA */}
          <footer className="mt-16 border-t border-border pt-12 text-center">
            <h3 className="text-2xl font-bold text-foreground mb-4">
              Ready to start chatting?
            </h3>
            <p className="text-muted-foreground mb-6">
              Join thousands of users on ChatNexus for free. No registration required.
            </p>
            <div className="flex justify-center gap-4">
              <Link
                href="/stranger-chat"
                className="inline-flex h-11 items-center justify-center rounded-full bg-brand-primary px-8 text-sm font-medium text-white shadow transition-colors hover:bg-brand-primary/90 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
              >
                Talk to Strangers
              </Link>
              <Link
                href="/global-chat-room"
                className="inline-flex h-11 items-center justify-center rounded-full border border-border bg-background px-8 text-sm font-medium shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
              >
                Global Chat Room
              </Link>
            </div>
          </footer>
        </article>

        <PageFooter />
      </div>
    </>
  );
}
