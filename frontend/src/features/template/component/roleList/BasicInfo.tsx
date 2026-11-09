import React from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { TextArea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface BasicInfoProps {
  name: string;
  setName: (value: string) => void;
  description: string;
  setDescription: (value: string) => void;
  roleType: string;
  setRoleType: (value: string) => void;
}

export const BasicInfo: React.FC<BasicInfoProps> = ({
  name,
  setName,
  description,
  setDescription,
  roleType,
  setRoleType,
}) => {
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-sm">
      <div className="p-6 border-b">
        <h3 className="text-xl font-bold text-primary">Basic Information</h3>
      </div>
      <div className="p-6 space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="space-y-2 flex col-span-1 flex-col gap-2">
            <Label
              htmlFor="name"
              className="text-sm font-medium text-primary"
            >
              Role Name <span className="text-red-500">*</span>
            </Label>
            <Input
              id="name"
              placeholder="e.g., Project Manager, Developer"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="w-full h-11 border border-gray-300 px-4 py-3 rounded-md focus:ring-2 focus:ring-primary focus:border-transparent transition-all duration-200 outline-none"
            />
          </div>

          {/* Role Type Dropdown */}
          {/* <div className="space-y-2 flex col-span-1 flex-col gap-2">
            <Label
              htmlFor="role_type"
              className="text-sm font-medium text-primary"
            >
              Role Type <span className="text-red-500">*</span>
            </Label>
            <Select
              value={roleType}
              onValueChange={(value) => setRoleType(value)}
            >
              <SelectTrigger className="h-11 border border-gray-300 px-4 py-3 rounded-md focus:ring-2 focus:ring-primary focus:border-transparent transition-all duration-200 outline-none">
                <SelectValue placeholder="Select role type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="internal">Internal</SelectItem>
                <SelectItem value="external">External</SelectItem>
              </SelectContent>
            </Select>
          </div> */}

          <div className="space-y-2 flex col-span-1 flex-col gap-2">
            <Label
              htmlFor="description"
              className="text-sm font-medium text-primary"
            >
              Description <span className="text-red-500">*</span>
            </Label>
            <TextArea
              id="description"
              placeholder="Brief description of the role"
              rows={4}
              value={description}
              onChange={(val) => setDescription(val)}
              className="w-full min-h-[44px] border border-gray-300 px-4 py-3 rounded-md focus:ring-2 focus:ring-primary focus:border-transparent transition-all duration-200 outline-none resize-none"
            />
          </div>
        </div>
      </div>
    </div>
  );
};
