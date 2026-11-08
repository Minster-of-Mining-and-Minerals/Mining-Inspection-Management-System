"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Image from "next/image";
import { ChevronRight, X } from "lucide-react";

import { NAVIGATION, NavItem } from "@/navigation.config";
import { canAccessItem } from "@/lib/can-access";
import { usePermissions } from "@/hooks/usePermissions";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubItem,
  SidebarMenuSubButton,
  useSidebar,
} from "@/components/ui/sidebar";

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { SidebarUserCard } from "./nav-user";

const stripLocale = (pathname: string) => {
  const segments = pathname.split("/");
  if (segments.length > 1 && ["en", "am"].includes(segments[1])) {
    return "/" + segments.slice(2).join("/");
  }
  return pathname;
};

const isOn = (pathname: string, url: string) =>
  pathname === url || pathname.startsWith(`${url}/`);

// Top-level item: navy, light text; active = gold pill
const itemClass =
  "h-10 px-3 text-[0.9375rem] text-slate-200 hover:bg-white/10 hover:text-white " +
  "data-[active=true]:bg-golden-bright data-[active=true]:font-semibold data-[active=true]:text-primary " +
  "group-data-[collapsible=icon]:justify-center";

/** Groups consecutive nav items under their `section` heading */
const groupBySection = (items: NavItem[]) =>
  items.reduce<{ section: string; items: NavItem[] }[]>((groups, item) => {
    const section = item.section ?? "";
    const last = groups[groups.length - 1];
    if (last && last.section === section) last.items.push(item);
    else groups.push({ section, items: [item] });
    return groups;
  }, []);

export function AppSidebar() {
  const { permissions: userPermissions } = usePermissions();
  const rawPathname = usePathname();
  const pathname = stripLocale(rawPathname);
  const { isMobile, setOpenMobile, setOpen } = useSidebar();

  // Phone: close the drawer after navigating, otherwise it stays over the new page
  useEffect(() => {
    setOpenMobile(false);
  }, [rawPathname, setOpenMobile]);

  // Tablet (768–1023px): collapse to the icon rail so the content keeps its width.
  // Re-expand when the window grows to desktop size. setOpen changes identity on
  // every toggle, so read it from a ref and subscribe once — otherwise a user
  // expanding the sidebar on a tablet would be collapsed straight back.
  const setOpenRef = useRef(setOpen);
  setOpenRef.current = setOpen;
  useEffect(() => {
    const tablet = window.matchMedia("(min-width: 768px) and (max-width: 1023px)");
    const apply = () => setOpenRef.current(!tablet.matches);
    if (tablet.matches) setOpenRef.current(false);
    tablet.addEventListener("change", apply);
    return () => tablet.removeEventListener("change", apply);
  }, []);

  const visibleNav = NAVIGATION.filter((item) =>
    canAccessItem(item, userPermissions)
  ).map((item) => ({
    ...item,
    children: item.children?.filter((c) =>
      canAccessItem(c, userPermissions)
    ),
  }));

  return (
    <Sidebar collapsible="icon" variant="sidebar" className="border-r-0">
      {/* ---------- HEADER ---------- */}
      <SidebarHeader className="gap-0 p-0">
        <Link
          href="/dashboard"
          className="flex h-16 items-center gap-3 border-b border-white/10 px-4 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0"
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white">
            <Image src="/logo-only.png" alt="Ministry of Mines" width={30} height={30} className="h-[30px] w-[30px] object-contain" />
          </span>
          <span className="flex min-w-0 flex-col leading-tight group-data-[collapsible=icon]:hidden">
            <span className="truncate text-sm font-bold text-white">የማዕድን ሚኒስቴር</span>
            <span className="truncate text-xs text-slate-300">Mining Inspection</span>
          </span>
          {isMobile && (
            <button
              type="button"
              aria-label="Close menu"
              onClick={(e) => {
                e.preventDefault();
                setOpenMobile(false);
              }}
              className="ml-auto flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-300 hover:bg-white/10 hover:text-white"
            >
              <X className="h-5 w-5" />
            </button>
          )}
        </Link>
      </SidebarHeader>

      {/* ---------- MENU ---------- */}
      {/* Still scrolls (wheel / touch), but without a visible scrollbar */}
      <SidebarContent className="py-2 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
        {groupBySection(visibleNav).map(({ section, items }) => (
          <SidebarGroup key={section || items[0].url} className="px-3 py-1.5">
            {section && (
              <SidebarGroupLabel className="h-7 px-3 text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-slate-400">
                {section}
              </SidebarGroupLabel>
            )}
            <SidebarGroupContent>
              <SidebarMenu className="gap-0.5">
                {items.map((item) =>
                  item.children?.length ? (
                    <Collapsible
                      key={item.title}
                      asChild
                      defaultOpen={isOn(pathname, item.url)}
                      className="group/collapsible"
                    >
                      <SidebarMenuItem>
                        <CollapsibleTrigger asChild>
                          <SidebarMenuButton
                            tooltip={item.title}
                            className={`${itemClass} group-data-[state=open]/collapsible:bg-white/10 group-data-[state=open]/collapsible:text-white`}
                          >
                            <item.icon className="size-[18px]" />
                            <span>{item.title}</span>
                            <ChevronRight className="ml-auto size-4 transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
                          </SidebarMenuButton>
                        </CollapsibleTrigger>

                        <CollapsibleContent>
                          <SidebarMenuSub className="mx-0 ml-[1.3rem] mt-0.5 gap-0.5 border-l border-white/15 py-0.5 pl-3 pr-0">
                            {item.children.map((child) => (
                              <SidebarMenuSubItem key={child.url}>
                                <SidebarMenuSubButton
                                  asChild
                                  // Also highlight on sub-pages, e.g. a sector's detail page
                                  isActive={isOn(pathname, child.url)}
                                  className="h-9 px-3 text-slate-300 hover:bg-white/10 hover:text-white
                                    data-[active=true]:bg-golden-bright data-[active=true]:font-semibold data-[active=true]:text-primary
                                    [&>svg]:text-current"
                                >
                                  <Link href={child.url}>
                                    <child.icon className="size-4" />
                                    <span>{child.title}</span>
                                  </Link>
                                </SidebarMenuSubButton>
                              </SidebarMenuSubItem>
                            ))}
                          </SidebarMenuSub>
                        </CollapsibleContent>
                      </SidebarMenuItem>
                    </Collapsible>
                  ) : (
                    <SidebarMenuItem key={item.url}>
                      <SidebarMenuButton
                        asChild
                        isActive={isOn(pathname, item.url)}
                        tooltip={item.title}
                        className={itemClass}
                      >
                        <Link href={item.url}>
                          <item.icon className="size-[18px]" />
                          <span>{item.title}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  )
                )}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      {/* ---------- PROFILE ---------- */}
      <SidebarFooter className="p-3 group-data-[collapsible=icon]:p-2">
        <SidebarUserCard />
      </SidebarFooter>
    </Sidebar>
  );
}
