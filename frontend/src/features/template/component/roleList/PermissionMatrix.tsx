import React from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Check,
  ChevronDown,
  ChevronRight,
  Users,
  Shield,
  Folder,
  BarChart3,
  Settings,
  Home,
  AlertCircle,
  Layers,
  Building,
} from "lucide-react";
import { Permission, ResourceGroup } from "../../types/role";

interface PermissionMatrixProps {
  loadingPermissions: boolean;
  resourceGroups: ResourceGroup[];
  expandedResource: string | null;
  permissionMatrix: PermissionMatrix;
  toggleResource: (resource: string) => void;
  togglePermission: (resource: string, action: string) => void;
  selectAllInResource: (resource: string, select: boolean) => void;
  getResourceSelectionStatus: (resource: string) => string;
  getSelectionStatusText: (status: string) => string;
  getSelectionStatusClass: (status: string) => string;
  getSelectedPermissionsCount: () => number;
  getTotalPermissionsCount: () => number;
}

export const PermissionMatrix: React.FC<PermissionMatrixProps> = ({
  loadingPermissions,
  resourceGroups,
  expandedResource,
  permissionMatrix,
  toggleResource,
  togglePermission,
  selectAllInResource,
  getResourceSelectionStatus,
  getSelectionStatusText,
  getSelectionStatusClass,
  getSelectedPermissionsCount,
  getTotalPermissionsCount,
}) => {
  const resourceIcons: { [key: string]: JSX.Element } = {
    dashboard: <Home className="h-4 w-4" />,
    users: <Users className="h-4 w-4" />,
    roles: <Shield className="h-4 w-4" />,
    projects: <Folder className="h-4 w-4" />,
    issues: <AlertCircle className="h-4 w-4" />,
    issue_categories: <Layers className="h-4 w-4" />,
    issue_flows: <BarChart3 className="h-4 w-4" />,
    issue_priorities: <AlertCircle className="h-4 w-4" />,
    human_resources: <Users className="h-4 w-4" />,
    organization_structures: <Building className="h-4 w-4" />,
    organizations: <Building className="h-4 w-4" />,
    permissions: <Shield className="h-4 w-4" />,
    system: <Settings className="h-4 w-4" />,
  };
  const isAllSelected = () => {
    const total = getTotalPermissionsCount();
    const selected = getSelectedPermissionsCount();
    return total > 0 && total === selected;
  };
  const toggleSelectAll = () => {
    const select = !isAllSelected();

    resourceGroups.forEach((group) => {
      selectAllInResource(group.resource, select);
    });
  };

  if (loadingPermissions) {
    return (
      <div className="bg-white border border-gray-200 rounded-lg shadow-sm">
        <div className="p-6 border-b">
          <h3 className="text-xl font-bold text-primary">
            Permission Matrix
          </h3>
        </div>
        <div className="p-8 text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
          <p className="text-sm text-gray-500 mt-2">Loading permissions...</p>
        </div>
      </div>
    );
  }

  if (resourceGroups.length === 0) {
    return (
      <div className="bg-white border border-gray-200 rounded-lg shadow-sm">
        <div className="p-6 border-b">
          <h3 className="text-xl font-bold text-primary">
            Permission Matrix
          </h3>
        </div>
        <div className="p-8 text-center text-gray-500">
          No permissions available
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-sm">
      <div className="p-6 border-b">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-xl font-bold text-primary">
            Permission Matrix
          </h3>

          <div className="flex flex-wrap gap-4">
            <div className="flex items-center space-x-2 text-sm">
              <span className="text-primary">Selected:</span>
              <span className="font-semibold text-primary">
                {getSelectedPermissionsCount()}
              </span>
              <span className="text-primary">/</span>
              <span className="text-primary">
                {getTotalPermissionsCount()}
              </span>
            </div>
            <button
              type="button"
              onClick={toggleSelectAll}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 ${
                isAllSelected() ? "bg-green-600" : "bg-gray-400"
              }`}
              title={isAllSelected() ? "Deselect All" : "Select All"}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform duration-200 ${
                  isAllSelected() ? "translate-x-6" : "translate-x-1"
                }`}
              />
            </button>
            {/* select all, Deselect All text */}
            <div className="text-sm font-medium text-gray-700">
              {isAllSelected() ? "Deselect All" : "Select All"}
            </div>
          </div>
        </div>
      </div>
      <div className="p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
          {resourceGroups.map((group) => {
            const selectionStatus = getResourceSelectionStatus(group.resource);
            const isExpanded = expandedResource === group.resource;
            const isAllSelected = selectionStatus === "all";

            return (
              <div
                key={group.resource}
                className="border border-golden-dark20 rounded-lg self-start"
              >
                {/* Resource Header */}
                <div
                  onClick={() => toggleResource(group.resource)}
                  className="flex transition-all bg-golden-dark10 hover:bg-golden-dark30 duration-200 cursor-pointer items-center justify-between p-4  rounded-t-lg"
                >
                  <div className="flex items-center space-x-3 flex-1">
                    <button
                      type="button"
                      onClick={() => toggleResource(group.resource)}
                      className="p-1 hover:bg-gray-200 rounded"
                    >
                      {isExpanded ? (
                        <ChevronDown className="h-5 w-5 text-primary hover:text-primary/90" />
                      ) : (
                        <ChevronRight className="h-5 w-5 text-primary hover:text-primary/90" />
                      )}
                    </button>
                    <div className="p-2 text-golden-dark  rounded-lg  ">
                      {resourceIcons[group.resource] || (
                        <Shield className="h-4 w-4" />
                      )}
                    </div>
                    <div>
                      <h3 className="font-semibold text-primary capitalize">
                        {group.resource.replace(/_/g, " ")}
                      </h3>
                      <p className="text-sm text-primary">
                        {group.permissions.length} permissions available
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-3">
                    <span
                      className={`px-2 py-1 text-xs font-medium border rounded-full text-primary ${getSelectionStatusClass(
                        selectionStatus
                      )}`}
                    >
                      {getSelectionStatusText(selectionStatus)}
                    </span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        selectAllInResource(group.resource, !isAllSelected);
                      }}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 ${
                        isAllSelected ? "bg-green-600" : "bg-gray-400"
                      }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform duration-200 ${
                          isAllSelected ? "translate-x-6" : "translate-x-1"
                        }`}
                      />
                    </button>
                  </div>
                </div>

                {/* Permissions List with Animation */}
                <AnimatePresence>
                  {isExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.25 }}
                      className="overflow-hidden"
                    >
                      <div className="p-4 bg-white rounded-b-lg border-t border-gray-200">
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                          {group.permissions.map((permission) => (
                            <label
                              key={permission.permission_id}
                              className="flex w-full items-center space-x-3 p-3 border border-golden-darkLight rounded-lg hover:bg-gray-50 cursor-pointer transition-colors duration-150"
                            >
                              <div className="relative">
                                <input
                                  type="checkbox"
                                  checked={
                                    permissionMatrix[group.resource]?.[
                                      permission.action
                                    ] || false
                                  }
                                  onChange={() =>
                                    togglePermission(
                                      group.resource,
                                      permission.action
                                    )
                                  }
                                  className="sr-only"
                                />
                                <div
                                  className={`w-5 h-5 border-2 rounded flex items-center justify-center transition-all duration-200 ${
                                    permissionMatrix[group.resource]?.[
                                      permission.action
                                    ]
                                      ? "bg-primary border-primary"
                                      : "border-golden-dark"
                                  }`}
                                >
                                  {permissionMatrix[group.resource]?.[
                                    permission.action
                                  ] && (
                                    <Check className="h-3 w-3 text-white font-extrabold" />
                                  )}
                                </div>
                              </div>

                              <span className="text-sm font-medium text-gray-700 capitalize">
                                {permission.action.replace(/_/g, " ")}
                              </span>
                            </label>
                          ))}
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
