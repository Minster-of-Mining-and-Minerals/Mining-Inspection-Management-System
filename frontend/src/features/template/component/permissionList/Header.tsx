import React from "react";
import { Shield } from "lucide-react";

export const PermissionHeader: React.FC = () => (
  <div className="flex flex-wrap gap-3 mb-6 sm:mb-10 rounded-t-lg items-center justify-between p-4 sm:p-6 border-b border-gray-200 bg-gradient-to-r from-golden-metallic to-golden-darkLight">
    <div className="flex items-center space-x-3">
      <div className="p-2   rounded-lg">
        <Shield className="h-6 w-6 text-golden-dark" />
      </div>
      <div>
        <h2 className="text-2xl font-bold text-primary-dark">
          Permission Management
        </h2>
        <p className="text-sm text-gray-600">
          Manage and configure system permissions
        </p>
      </div>
    </div>
  </div>
);
