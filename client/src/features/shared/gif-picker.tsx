import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Search, TrendingUp, X } from "lucide-react";
import { fetchWithTimeout } from "@/lib/api-client";
import { cn } from "@/lib/utils";

const TENOR_API_KEY = import.meta.env.VITE_TENOR_API_KEY?.trim() ?? "";
const TENOR_BASE_URL = "https://tenor.googleapis.com/v2";
const TENOR_CLIENT_KEY = "chatnexus";

type TenorGif = {
  id: string;
  title: string;
  media_formats: {
    tinygif?: { url: string; dims: [number, number] };
    gif?: { url: string; dims: [number, number] };
    nanogif?: { url: string; dims: [number, number] };
    mediumgif?: { url: string; dims: [number, number] };
  };
  content_description: string;
};

type TenorCategory = {
  searchterm: string;
  image: string;
};

type GifPickerProps = {
  onGifClick: (url: string) => void;
  autoFocusSearch?: boolean;
  showSearch?: boolean;
  showCategories?: boolean;
  showStatus?: boolean;
  showFooter?: boolean;
  className?: string;
};

export function GifPicker({
  onGifClick,
  autoFocusSearch = true,
  showSearch = true,
  showCategories = true,
  showStatus = true,
  showFooter = true,
  className,
}: GifPickerProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [gifs, setGifs] = useState<TenorGif[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [categories, setCategories] = useState<TenorCategory[]>([]);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const nextPosRef = useRef("");

  useEffect(() => {
    if (!autoFocusSearch || !showSearch) {
      return;
    }

    const timeout = setTimeout(() => inputRef.current?.focus(), 100);
    return () => clearTimeout(timeout);
  }, [autoFocusSearch, showSearch]);

  const handleMissingApiKey = useCallback(() => {
    setGifs([]);
    setCategories([]);
    setError("GIF search is unavailable right now.");
  }, []);

  const fetchTrending = useCallback(async () => {
    if (!TENOR_API_KEY) {
      handleMissingApiKey();
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetchWithTimeout(
        `${TENOR_BASE_URL}/featured?key=${TENOR_API_KEY}&client_key=${TENOR_CLIENT_KEY}&limit=30&media_filter=tinygif,gif`,
      );
      if (!res.ok) {
        throw new Error("Failed to fetch");
      }

      const data = (await res.json()) as {
        results?: TenorGif[];
        next?: string;
      };
      setGifs(data.results || []);
      nextPosRef.current = data.next || "";
    } catch {
      setError("Failed to load GIFs");
    } finally {
      setLoading(false);
    }
  }, [handleMissingApiKey]);

  const fetchCategories = useCallback(async () => {
    if (!TENOR_API_KEY) {
      handleMissingApiKey();
      return;
    }

    try {
      const res = await fetchWithTimeout(
        `${TENOR_BASE_URL}/categories?key=${TENOR_API_KEY}&client_key=${TENOR_CLIENT_KEY}&type=trending`,
      );
      if (!res.ok) {
        return;
      }

      const data = (await res.json()) as { tags?: TenorCategory[] };
      setCategories((data.tags || []).slice(0, 8));
    } catch {
      // Categories are optional.
    }
  }, [handleMissingApiKey]);

  useEffect(() => {
    if (!showCategories) {
      return;
    }

    void fetchCategories();
  }, [fetchCategories, showCategories]);

  const searchGifs = useCallback(
    async (query: string) => {
      abortControllerRef.current?.abort();

      if (!query.trim()) {
        abortControllerRef.current = null;
        await fetchTrending();
        return;
      }

      if (!TENOR_API_KEY) {
        abortControllerRef.current = null;
        handleMissingApiKey();
        return;
      }

      const controller = new AbortController();
      abortControllerRef.current = controller;

      setLoading(true);
      setError(null);

      try {
        const res = await fetchWithTimeout(
          `${TENOR_BASE_URL}/search?key=${TENOR_API_KEY}&client_key=${TENOR_CLIENT_KEY}&q=${encodeURIComponent(query)}&limit=30&media_filter=tinygif,gif`,
          { signal: controller.signal },
        );
        if (!res.ok) {
          throw new Error("Failed to search");
        }

        const data = (await res.json()) as {
          results?: TenorGif[];
          next?: string;
        };
        setGifs(data.results || []);
        nextPosRef.current = data.next || "";
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }

        setError("Search failed. Try again.");
      } finally {
        if (abortControllerRef.current === controller) {
          abortControllerRef.current = null;
          setLoading(false);
        }
      }
    },
    [fetchTrending, handleMissingApiKey],
  );

  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    const delay = searchTerm.trim() ? 400 : 0;
    searchTimeoutRef.current = setTimeout(() => {
      void searchGifs(searchTerm);
    }, delay);

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
        searchTimeoutRef.current = null;
      }

      abortControllerRef.current?.abort();
    };
  }, [searchTerm, searchGifs]);

  const getGifUrl = (gif: TenorGif) =>
    gif.media_formats.gif?.url ||
    gif.media_formats.mediumgif?.url ||
    gif.media_formats.tinygif?.url ||
    gif.media_formats.nanogif?.url ||
    "";

  const getPreviewUrl = (gif: TenorGif) =>
    gif.media_formats.tinygif?.url ||
    gif.media_formats.nanogif?.url ||
    gif.media_formats.gif?.url ||
    "";

  return (
    <div
      className={cn(
        "flex h-[20rem] w-full max-w-full flex-col overflow-hidden rounded-xl border border-border bg-card text-foreground shadow-2xl font-sans",
        className,
      )}
    >
      {showSearch && (
        <div className="flex-shrink-0 px-3 pb-2 pt-3">
          <div className="flex items-center gap-2 rounded-full border border-border bg-input px-3 py-2">
            <Search className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
            <input
              ref={inputRef}
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search GIFs..."
              aria-label="Search GIFs"
              className="flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => {
                  setSearchTerm("");
                  inputRef.current?.focus();
                }}
                className="rounded-full p-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                aria-label="Clear GIF search"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
      )}

      {showCategories && !searchTerm && categories.length > 0 && (
        <div className="flex flex-shrink-0 gap-1.5 overflow-x-auto border-b border-border px-3 py-2 scrollbar-none">
          {categories.map((category) => (
            <button
              key={category.searchterm}
              type="button"
              onClick={() => {
                setSearchTerm(category.searchterm);
              }}
              className="whitespace-nowrap rounded-full border border-border bg-muted/60 px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              {category.searchterm}
            </button>
          ))}
        </div>
      )}

      {showStatus && (
        <div className="flex flex-shrink-0 items-center gap-1.5 px-3 py-1.5 text-muted-foreground">
          <TrendingUp className="h-3 w-3" />
          <span className="text-[10px] font-medium uppercase tracking-wider">
            {searchTerm ? `Results for "${searchTerm}"` : "Trending"}
          </span>
        </div>
      )}

      <div
        className={cn(
          "flex-1 overflow-y-auto overflow-x-hidden px-2",
          showFooter ? "pb-2" : "pb-3",
          showSearch || showCategories || showStatus ? "pt-0" : "pt-2",
        )}
        style={{ scrollbarWidth: "none" }}
      >
        {loading && gifs.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <div className="flex flex-col items-center gap-2">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Loading GIFs...</span>
            </div>
          </div>
        ) : error ? (
          <div className="flex h-full items-center justify-center">
            <div className="flex flex-col items-center gap-2 px-4 text-center">
              <span className="text-sm text-muted-foreground">{error}</span>
              <button
                type="button"
                onClick={() => {
                  if (searchTerm) {
                    void searchGifs(searchTerm);
                  } else {
                    void fetchTrending();
                  }
                }}
                className="rounded-lg border border-border bg-muted/60 px-3 py-1.5 text-xs text-foreground transition-colors hover:bg-muted focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-card"
              >
                Try Again
              </button>
            </div>
          </div>
        ) : gifs.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <span className="text-sm text-muted-foreground">No GIFs found</span>
          </div>
        ) : (
          <div className="columns-2 gap-1.5">
            {gifs.map((gif) => (
              <button
                key={gif.id}
                type="button"
                onClick={() => {
                  const url = getGifUrl(gif);
                  if (url) {
                    onGifClick(url);
                  }
                }}
                className="group relative mb-1.5 block w-full cursor-pointer overflow-hidden rounded transition-opacity hover:opacity-80 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-card"
                title={gif.content_description || gif.title}
              >
                <img
                  src={getPreviewUrl(gif)}
                  alt={gif.content_description || gif.title || "Animated GIF"}
                  className="block h-auto w-full bg-muted"
                  loading="lazy"
                  style={{
                    minHeight: "60px",
                  }}
                />
                <div className="absolute inset-0 rounded-lg bg-black/0 transition-colors group-hover:bg-black/10" />
              </button>
            ))}
          </div>
        )}
      </div>

      {showFooter && (
        <div className="flex flex-shrink-0 items-center justify-center border-t border-border px-3 py-1.5">
          <span className="text-[9px] text-muted-foreground">Powered by Tenor</span>
        </div>
      )}
    </div>
  );
}
