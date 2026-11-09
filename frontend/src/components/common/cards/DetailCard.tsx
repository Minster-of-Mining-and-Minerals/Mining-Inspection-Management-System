"use client";
import React from "react";
import { CheckCircle, XCircle, Calendar } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Card,
  CardContent,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/utils/date";

export type DetailCardItem = {
  title: string;
  subtitle?: string;
  icon: React.ElementType;
  date: Date;
  active: boolean;
};

function DetailCard({ item }: { item: DetailCardItem }) {
  const Icon = item.icon;

  return (
    <Card className=" rounded-lg shadow-sm border border-gray-200 overflow-hidden">
      <CardContent className="p-4">
        {/* Header Row – Compact (same as org card) */}
        <div className="flex flex-wrap gap-2 items-center justify-between mb-4 pb-3 border-b border-gray-200">
          <div className="flex items-center gap-2.5">
            <div
              className={cn(
                "p-2 rounded-lg",
                item.active
                  ? "bg-emerald-600/10 text-emerald-600"
                  : "bg-gray-500/10 text-gray-500"
              )}
            >
              <Icon className="h-5 w-5" />
            </div>

            <div>
              <CardTitle className="text-primary text-lg font-semibold m-0">
                {item.title}
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                {item.subtitle || "N/A"}
              </p>
            </div>
          </div>

          <Badge
            status={item.active ? "active" : "inactive"}
            color={item.active ? "success" : "secondary"}
            className="text-xs shrink-0 flex items-center gap-1"
          >
            {item.active ? (
              <>
                <CheckCircle className="h-3 w-3" />
                Active
              </>
            ) : (
              <>
                <XCircle className="h-3 w-3" />
                Inactive
              </>
            )}
          </Badge>
        </div>

        {/* Footer – Compact date row (matches deleted/created style) */}
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <Calendar className="h-4 w-4 text-slate-500" />
          <span className="font-medium">Date:</span>
          <span>
            {formatDate(item.date)}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

export default DetailCard;
