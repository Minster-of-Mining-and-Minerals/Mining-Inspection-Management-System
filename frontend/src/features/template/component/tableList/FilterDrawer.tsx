import React from "react";
import { X, ChevronDown } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  SearchableSelect,
  type SelectOption,
} from "@/components/ui/searchable-select";
import { cn } from "@/lib/utils";
import type { FilterField } from "@/types/tableLayout";
import { Button } from "@/components/ui/button";

interface FilterDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  filters: FilterField[];
  onApply: () => void;
  onClear: () => void;
  className?: string;
  columnsPerRow?: number;
}

export const FilterDrawer: React.FC<FilterDrawerProps> = ({
  isOpen,
  onClose,
  filters,
  onApply,
  onClear,
  className,
  columnsPerRow = 1,
}) => {
  if (!isOpen) return null;

  const renderFilterField = (field: FilterField) => {
    switch (field.type) {
      case "text":
        return (
          <div key={field.key} className="space-y-2">
            <Label htmlFor={field.key}>{field.label}</Label>
            <Input
              id={field.key}
              placeholder={field.placeholder}
              value={field.value || ""}
              onChange={(e) => field.onChange(e.target.value)}
            />
          </div>
        );

      case "select":
        return (
          <div key={field.key} className="space-y-2">
            <Label htmlFor={field.key}>{field.label}</Label>
            <Select value={field.value || ""} onValueChange={field.onChange}>
              <SelectTrigger>
                <SelectValue
                  placeholder={field.placeholder || `Select ${field.label}`}
                />
              </SelectTrigger>
              <SelectContent>
                {field.options?.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        );

      case "multiselect": {
        const multiSelectOptions: SelectOption[] =
          field.options?.map((option) => ({
            value: option.value,
            label: option.label,
          })) || [];

        const currentValues = field.value
          ? Array.isArray(field.value) 
            ? field.value 
            : field.value.split(",").map((s: string) => s.trim())
          : [];
        const selectedOptions = multiSelectOptions.filter((option) =>
          currentValues.includes(option.value)
        );

        return (
          <div key={field.key} className="space-y-2">
            <Label htmlFor={field.key}>{field.label}</Label>
            <SearchableSelect
              value={selectedOptions}
              onChange={(value) => {
                if (Array.isArray(value)) {
                  const values = value.map((option) => option.value).join(",");
                  field.onChange(values);
                } else {
                  field.onChange("");
                }
              }}
              options={multiSelectOptions}
              placeholder={field.placeholder || `Select ${field.label}`}
              isMulti={true}
              isSearchable={true}
              isClearable={true}
            />
          </div>
        );
      }

      case "date":
        return (
          <div key={field.key} className="space-y-2">
            <Label htmlFor={field.key}>{field.label}</Label>
            <Input
              id={field.key}
              type="date"
              value={field.value || ""}
              onChange={(e) => field.onChange(e.target.value)}
            />
          </div>
        );

      case "daterange":
        return (
          <div key={field.key} className="space-y-2">
            <Label htmlFor={field.key}>{field.label}</Label>
            <div className="flex space-x-2">
              <Input
                id={`${field.key}-from`}
                type="date"
                placeholder="From"
                value={field.value?.from || ""}
                onChange={(e) =>
                  field.onChange({ ...field.value, from: e.target.value })
                }
              />
              <Input
                id={`${field.key}-to`}
                type="date"
                placeholder="To"
                value={field.value?.to || ""}
                onChange={(e) =>
                  field.onChange({ ...field.value, to: e.target.value })
                }
              />
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black bg-opacity-25 z-40"
        onClick={onClose}
      />

      {/* Drawer */}
      <div
        className={cn(
          "fixed top-0 right-0 h-full bg-white shadow-xl z-50 transform transition-transform duration-300 ease-in-out",
          isOpen ? "translate-x-0" : "translate-x-full",
          className
        )}
        style={{
          width: `${320 * columnsPerRow}px`, // 320px base width * column count
        }}
      >
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900">
              Filters
            </h3>
            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
              className="h-8 w-8 p-0"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-6">
            <div
              className={cn(
                "grid gap-6",
                columnsPerRow === 1 && "grid-cols-1",
                columnsPerRow === 2 && "grid-cols-2",
                columnsPerRow === 3 && "grid-cols-3",
                columnsPerRow === 4 && "grid-cols-4"
              )}
            >
              {filters.map((field) => renderFilterField(field))}
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end space-x-3 p-6 border-t border-gray-200">
            <Button variant="outline" onClick={onClear} className="px-6">
              Clear
            </Button>
            <Button onClick={onApply} className="px-6">
              Apply
            </Button>
          </div>
        </div>
      </div>
    </>
  );
};

// New FilterPopover component - popover style like in the sample UIs
interface FilterPopoverProps {
  filters?: FilterField[];
  onApply?: () => void;
  onClear?: () => void;
  children?: React.ReactNode;
  columnsPerRow?: number;
}

export const FilterPopover: React.FC<FilterPopoverProps> = ({
  filters = [],
  onApply,
  onClear,
  children,
  columnsPerRow = 1,
}) => {
  const renderFilterField = (field: FilterField) => {
    switch (field.type) {
      case "text":
        return (
          <div key={field.key} className="space-y-2">
            <Label
              htmlFor={field.key}
              className="text-xs font-medium text-gray-700 uppercase tracking-wide"
            >
              {field.label}
            </Label>
            <Input
              id={field.key}
              placeholder={field.placeholder}
              value={field.value || ""}
              onChange={(e) => field.onChange(e.target.value)}
              className="h-8 text-sm"
            />
          </div>
        );

      case "select":
        return (
          <div key={field.key} className="space-y-2">
            <Label
              htmlFor={field.key}
              className="text-xs font-medium text-gray-700 uppercase tracking-wide"
            >
              {field.label}
            </Label>
            <Select value={field.value || ""} onValueChange={field.onChange}>
              <SelectTrigger className="h-8 text-sm">
                <SelectValue
                  placeholder={field.placeholder || `Select ${field.label}`}
                />
              </SelectTrigger>
              <SelectContent>
                {field.options?.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        );

      case "multiselect": {
        const multiSelectOptionsPopover: SelectOption[] =
          field.options?.map((option) => ({
            value: option.value,
            label: option.label,
          })) || [];

        const currentValuesPopover = field.value
          ? Array.isArray(field.value) 
            ? field.value 
            : field.value.split(",").map((s: string) => s.trim())
          : [];
        const selectedOptionsPopover = multiSelectOptionsPopover.filter(
          (option) => currentValuesPopover.includes(option.value)
        );

        return (
          <div key={field.key} className="space-y-2">
            <Label
              htmlFor={field.key}
              className="text-xs font-medium text-gray-700 uppercase tracking-wide"
            >
              {field.label}
            </Label>
            <SearchableSelect
              value={selectedOptionsPopover}
              onChange={(value) => {
                if (Array.isArray(value)) {
                  const values = value.map((option) => option.value).join(",");
                  field.onChange(values);
                } else {
                  field.onChange("");
                }
              }}
              options={multiSelectOptionsPopover}
              placeholder={field.placeholder || `Select ${field.label}`}
              isMulti={true}
              isSearchable={true}
              isClearable={true}
            />
          </div>
        );
      }

      case "date":
        return (
          <div key={field.key} className="space-y-2">
            <Label
              htmlFor={field.key}
              className="text-xs font-medium text-gray-700 uppercase tracking-wide"
            >
              {field.label}
            </Label>
            <Input
              id={field.key}
              type="date"
              value={field.value || ""}
              onChange={(e) => field.onChange(e.target.value)}
              className="h-8 text-sm"
            />
          </div>
        );

      case "daterange":
        return (
          <div key={field.key} className="space-y-2">
            <Label
              htmlFor={field.key}
              className="text-xs font-medium text-gray-700 uppercase tracking-wide"
            >
              {field.label}
            </Label>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs text-gray-500">
                  From
                </Label>
                <Input
                  id={`${field.key}-from`}
                  type="date"
                  placeholder="From"
                  value={field.value?.from || ""}
                  onChange={(e) =>
                    field.onChange({ ...field.value, from: e.target.value })
                  }
                  className="h-8 text-sm"
                />
              </div>
              <div>
                <Label className="text-xs text-gray-500">
                  To
                </Label>
                <Input
                  id={`${field.key}-to`}
                  type="date"
                  placeholder="To"
                  value={field.value?.to || ""}
                  onChange={(e) =>
                    field.onChange({ ...field.value, to: e.target.value })
                  }
                  className="h-8 text-sm"
                />
              </div>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" className="flex h-12 flex-1 items-center justify-center space-x-2 border-[1.5px] border-primary font-semibold text-primary sm:h-9 sm:flex-none sm:border sm:border-input sm:font-medium sm:text-foreground">
          <svg
            className="h-4 w-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"
            />
          </svg>
          <span>
            Filters
          </span>
          <ChevronDown className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="p-4"
        align="end"
        style={{
          width: `${320 * columnsPerRow}px`, // 320px base width * column count
        }}
      >
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-primary">
              Filters
            </h3>
          </div>

          <div
            className={cn(
              "grid gap-4",
              columnsPerRow === 1 && "grid-cols-1",
              columnsPerRow === 2 && "grid-cols-2",
              columnsPerRow === 3 && "grid-cols-3",
              columnsPerRow === 4 && "grid-cols-4"
            )}
          >
            {/* Render children if provided, otherwise render filters */}
            {children
              ? children
              : filters.map((field) => renderFilterField(field))}
          </div>

          {/* Only show action buttons if onApply and onClear are provided */}
          {(onApply || onClear) && (
            <div className="flex space-x-2 pt-2 border-t">
              {onClear && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onClear}
                  className="flex-1 h-8 text-sm"
                >
                  Clear
                </Button>
              )}
              {onApply && (
                <Button
                  size="sm"
                  onClick={onApply}
                  className="flex-1 h-8 text-sm"
                >
                  Apply
                </Button>
              )}
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
};
