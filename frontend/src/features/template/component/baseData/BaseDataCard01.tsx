"use client";

import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Building, Gem, MapPin } from "lucide-react";
import { useRouter } from "next/navigation";
import { PermissionGuard } from "@/components/auth/InlinePermissionGuard";
import { usePermissions } from "@/hooks/usePermissions";
import { PermissionKey } from "@/lib/permissions";

const dataCards: DataCardItem[] = [
  {
    id: 3,
    title: "Minerals",
    subtitle: "Standard minerals list",
    icon: Gem,
    link: "/basedata/minerals",
    permission: ["MINERALS:READ", "MINERALS:UPDATE"],
  },
  {
    id: 2,
    title: "Locations",
    subtitle: "Regions, zones and woredas",
    icon: MapPin,
    link: "/basedata/locations",
    permission: ["ADMIN_AREAS:READ"],
  },
  {
    id: 1,
    title: "Organization",
    subtitle: "Ministry units and departments",
    icon: Building,
    link: "/basedata/sectors",
    permission: ["SECTOR:READ", "SECTOR:UPDATE", "SECTOR:DELETE", "SECTOR:CREATE"],
  },
];


function BaseDataCard01() {
  const router = useRouter();
  const { canAny } = usePermissions();

  return (
    <div className="flex min-h-[calc(100vh-150px)] rounded-lg flex-col bg-white p-5 ">
      <h1 className="text-2xl font-bold text-primary">Base Data</h1>
      <p className="text-sm text-muted-foreground">Manage all your base data here</p>
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3 mt-6 ">
        {dataCards
          .filter((item) => canAny(item.permission as PermissionKey[])) // ✅ Only show if user has at least one permission
          .map((item) => {
            const Icon = item.icon;

            return (
              <Card
                key={item.id}
                onClick={() => router.push(item.link)}
                className="flex gap-5 bg-golden-metallic shadow-md hover:shadow-xl transition-shadow duration-300  rounded-3xl justify-between items-center p-4   border border-gray-200 dark:bg-gray-800 dark:border-gray-700 w-full"
              >
                <CardContent className="flex items-center w-full px-2   py-2 justify-between">
                  {/* Left Section */}
                  <div className="flex items-center gap-2  ">
                    <div className="flex h-14 w-14 items-center justify-center rounded-xl ">
                      <Icon className="h-8 w-8 text-primary" />
                    </div>

                    <div>
                      <h4 className="text-base text-primary font-semibold">{item.title}</h4>
                      <p className="text-sm text-muted-foreground">
                        {item.subtitle}
                      </p>
                    </div>
                  </div>

                  {/* Action */}
                  <Button size="default" className="rounded-lg px-7 gap-1">
                    {/* <Eye className="h-4 w-4" /> */}
                    View
                  </Button>

                </CardContent>
              </Card>
            );
          })}
      </div>
    </div>
  );
}

export default BaseDataCard01;
