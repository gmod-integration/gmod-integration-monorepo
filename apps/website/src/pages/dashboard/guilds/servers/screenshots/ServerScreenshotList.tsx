import { Component, createSignal, For, onCleanup, onMount, Show } from "solid-js";
import AdminPanel from "../../../../../components/AdminPanel";
import { useI18n } from "../../../../../i18n";
import { QuerySort } from "../../../../../utils/types/QueryTypes";
import { fetchAPI } from "../../../../../utils/api";
import { Screenshot } from "./Screenshot";
import { FocusImg } from "./FocusImg";
import { linkBadge } from "../../../../../components/layout/menu/DashboardMenu";

export interface captureData {
  x: number;
  y: number;
  w: number;
  h: number;
  quality: number;
  format: string;
}

export interface ScreenshotStructure {
  id: number;
  serverID: string;
  title?: string;
  player: any;
  url: string;
  createdAt: string;
  channelID: string;
  captureData?: any;
}

interface ScreenshotResponseStructure {
  screenshots: ScreenshotStructure[];
  query: { total: number };
}

export const ServerScreenshotList: Component = () => {
  const { t } = useI18n();

  // paging & accumulated state
  const [items, setItems] = createSignal<ScreenshotStructure[]>([]);
  const [offset, setOffset] = createSignal(0);
  const limit = 20;
  const [loading, setLoading] = createSignal(false);
  const [hasMore, setHasMore] = createSignal(true);

  let sentinel!: HTMLDivElement;
  let observer: IntersectionObserver;

  // check if sentinel is in view or near viewport
  const checkForMore = () => {
    if (loading() || !hasMore()) return;
    const rect = sentinel.getBoundingClientRect();
    if (rect.top < window.innerHeight + 200) {
      loadPage();
    }
  };

  // fetch + append pages, scrolling new items into view if at bottom
  const loadPage = async () => {
    if (loading() || !hasMore()) return;
    // determine if user is already at bottom
    const threshold = 50; // px
    const atBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - threshold;
    setLoading(true);
    const prevCount = items().length;
    try {
      const prevOffset = offset();
      const res = await fetchAPI(
        `/users/:discordID/guilds/:guildID/servers/:serverID/screenshots` +
          `?offset=${prevOffset}&limit=${limit}&sort=createdAt&orderBy=${QuerySort.DESC}`,
        "GET",
      );
      if (!res.ok) throw new Error("Fetch failed");
      const body = (await res.json()) as ScreenshotResponseStructure;
      const page = body.screenshots.map((s) => {
        s.createdAt = new Date(s.createdAt).toLocaleString();
        if (s.player) {
          try {
            s.player = JSON.parse(s.player);
          } catch (e) {
            s.player = null;
          }
        } else {
          s.player = null;
        }
        if (s.captureData) {
          try {
            s.captureData = JSON.parse(s.captureData);
          } catch (e) {
            s.captureData = null;
          }
        } else {
          s.captureData = null;
        }
        return s;
      });
      if (page.length < limit) setHasMore(false);
      setItems((prev) => [...prev, ...page]);
      setOffset(prevOffset + page.length);

      // after appending, if user was at bottom, scroll to first new item
      if (atBottom) {
        requestAnimationFrame(() => {
          const grid = document.querySelector(".grid") as HTMLElement;
          const newElem = grid?.children[prevCount] as HTMLElement;
          if (newElem) newElem.scrollIntoView();
        });
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
      // after loading, re-check in case sentinel still in view
      requestAnimationFrame(checkForMore);
    }
  };

  onMount(() => {
    loadPage();
    observer = new IntersectionObserver(([entry]) => entry.isIntersecting && loadPage(), { rootMargin: "1000px" });
    observer.observe(sentinel);
    window.addEventListener("scroll", checkForMore);
  });

  onCleanup(() => {
    observer.disconnect();
    window.removeEventListener("scroll", checkForMore);
  });

  // focus-modal
  const [focusImg, setFocusImg] = createSignal<ScreenshotStructure | null>(null);

  return (
    <AdminPanel
      title={t("dashboard.server.screenshots_list.title", "All Screenshots")}
      description={t("dashboard.server.screenshots_list.description", "See all screenshots taken on your server")}
    >
      <FocusImg focusImg={focusImg} />

      <div class="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
        <For each={items()}>{(shot) => <Screenshot screenshot={shot} setFocusImg={setFocusImg} />}</For>
      </div>

      <Show when={loading()}>
        <div class="flex justify-center my-4">
          <span class="loading loading-spinner loading-lg" />
        </div>
      </Show>

      {/* sentinel pour IntersectionObserver */}
      <div ref={(el) => (sentinel = el!)} />

      <Show when={!hasMore() && !loading()}>
        <p class="text-center text-base-content/50 mt-4">
          {t("dashboard.server.screenshots_list.end_of_list", "You've reached the end!")}
        </p>
      </Show>
    </AdminPanel>
  );
};
