import React from "react";
import { BiToggleLeft, BiToggleRight } from "react-icons/bi";
import { Permission } from "../../types/permission";
import { PermissionGuard } from "@/components/auth/InlinePermissionGuard";

interface PermissionItemProps {
  permission: Permission;
  onToggle: (id: string) => Promise<void>;
  isToggling: boolean;
}

export const PermissionItem: React.FC<PermissionItemProps> = ({
  permission,
  onToggle,
  isToggling,
}) => {
  const isActive = !!permission.is_active;

  const handleToggle = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await onToggle(permission.permission_id);
  };

  return (
    <div className="flex items-center justify-between py-1 px-3 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
      <div className="flex items-center space-x-3 flex-1">
        <span className="text-sm font-medium text-gray-700 capitalize">
          {permission.action.replace("_", " ")}
        </span>
      </div>
      <PermissionGuard requireAll={["PERMISSIONS:UPDATE"]}>
        <button
          className={`p-0 transition-all duration-200 ${isActive ? "text-green-600" : "text-gray-400"
            }`}
          onClick={handleToggle}
          disabled={isToggling}
          title={isActive ? "Deactivate permission" : "Activate permission"}
        >
          {isToggling ? (
            <div className="w-10 h-10 flex items-center justify-center">
              <div className="h-6 w-6 border-2 border-current border-t-transparent rounded-full animate-spin" />
            </div>
          ) : isActive ? (
            <BiToggleRight
              className={`h-10 w-10 transition-transform duration-300 ${isActive ? "scale-100 rotate-0" : "scale-90 rotate-180"
                }`}
            />
          ) : (
            <BiToggleLeft
              className={`h-10 w-10 transition-transform duration-300 ${isActive ? "scale-100 rotate-0" : "scale-90 rotate-180"
                } text-red-200 hover:text-red-300`}
            />
          )}
        </button>
      </PermissionGuard>

    </div>
  );
};
