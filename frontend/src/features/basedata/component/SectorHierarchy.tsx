"use client";

import React, { useRef, useEffect, useState, useMemo } from "react";
import Tree, { RawNodeDatum } from "react-d3-tree";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectTrigger,
  SelectItem,
  SelectContent,
  SelectValue,
} from "@/components/ui/select";
import { useRouter } from "next/navigation";
import { SectorNode } from "@/redux/types/sectorNode";
import { CustomNodeProps, D3TreeNode, HierarchyD3TreeProps } from "@/types/d3treeNode";
import { CreateChildModal } from "@/components/common/modals/CreateChildModal";
import { buildSectorTree } from "@/utils/buildSectorTree";
import { PermissionGuard } from "@/components/auth/InlinePermissionGuard";

/**
 * Converts a StructureNode to D3Tree format
 * Recursively transforms the tree structure for react-d3-tree compatibility
 * 
 * @param node - StructureNode to convert
 * @returns D3TreeNode formatted for react-d3-tree
 */
function convertToD3Tree(node: SectorNode): D3TreeNode {
  return {
    name: node.name || "Unnamed",
    attributes: {
      sector_node_id: node.sector_node_id,
      name_am: node.name_am ?? null,
      description: node.description || "",
      parent_id: node.parent_id ?? null,
      level: node.level,
      is_active: node.is_active,
      child_count: node.children?.length ?? 0,
      head_name: node.head?.full_name ?? null,
    },
    children: node.children?.length
      ? node.children.map(convertToD3Tree)
      : undefined,
  };
}

/**
 * Custom Node Component for D3 Tree Visualization
 * 
 * Renders each node in the hierarchy tree with:
 * - Expand/collapse button (if node has children)
 * - Node name and description
 * - Active/Inactive status badge
 * - Action buttons (Details, Add Child)
 */
// Card size (the tree's nodeSize/separation below leave room for it)
const CARD_W = 300;
const CARD_H = 160;

/** Depth in the tree → what the public forms call it (top level → sector → department) */
const depthLabel = (depth: number) =>
  depth === 0 ? "TOP LEVEL" : depth === 1 ? "SECTOR" : "DEPARTMENT";

const CustomNode: React.FC<CustomNodeProps> = ({
  nodeDatum,
  toggleNode,
  onAddChild,
  onDetails,
  onEdit,
}) => {
  const { sector_node_id, name_am, is_active: isActive, child_count = 0, head_name } = nodeDatum.attributes;
  const hasChildren = !!nodeDatum.children?.length;
  const isCollapsed = nodeDatum.__rd3t?.collapsed ?? false;
  const depth = nodeDatum.__rd3t?.depth ?? 0;

  // Buttons sit inside the zoom/pan surface: keep clicks from reaching it
  const run = (fn?: (id: string) => void) => (e: React.MouseEvent) => {
    e.stopPropagation();
    fn?.(sector_node_id);
  };

  const meta = [
    child_count === 0 ? "No departments" : `${child_count} department${child_count === 1 ? "" : "s"}`,
    head_name ? `Head: ${head_name}` : "No head assigned",
  ].join(" · ");

  return (
    <g>
      {/* Expand / Collapse Button - Only shown for nodes with children */}
      {hasChildren && (
        <g transform={`translate(0, ${CARD_H / 2 + 6})`}>
          <foreignObject x={-12} y={-12} width={24} height={24}>
            <button
              onClick={toggleNode}
              className="w-6 h-6 rounded-full bg-primary text-white font-bold flex items-center justify-center shadow ring-2 ring-white cursor-pointer text-sm"
              aria-label={isCollapsed ? "Expand node" : "Collapse node"}
            >
              {isCollapsed ? "+" : "−"}
            </button>
          </foreignObject>
        </g>
      )}

      {/* Node Card (option B: navy header) */}
      <foreignObject x={-CARD_W / 2} y={-CARD_H / 2} width={CARD_W} height={CARD_H}>
        <div className="w-full h-full flex flex-col overflow-hidden rounded-[14px] border border-slate-300 bg-white shadow-md">
          {/* Header: level + status */}
          <div
            className={`flex items-center justify-between px-3 py-1.5 text-[11px] font-semibold tracking-wide text-white ${depth === 0 ? "bg-primary" : "bg-[#0B4F72]"}`}
          >
            <span>{depthLabel(depth)} · LEVEL {depth + 1}</span>
            <span className={`inline-flex items-center gap-1.5 ${isActive ? "text-green-200" : "text-red-200"}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${isActive ? "bg-green-400" : "bg-red-400"}`} />
              {isActive ? "Active" : "Inactive"}
            </span>
          </div>

          {/* Body: English + Amharic names */}
          <div className="flex-1 min-w-0 px-3 pt-2.5">
            <p className="truncate text-[15px] font-bold text-slate-900" title={nodeDatum.name}>
              {nodeDatum.name}
            </p>
            {name_am ? (
              <p lang="am" className="truncate text-[13px] font-medium text-golden-deep" title={name_am}>
                {name_am}
              </p>
            ) : (
              <p className="text-xs italic text-amber-700">No Amharic name — add one</p>
            )}
            <p className="mt-1.5 truncate text-xs text-slate-600" title={meta}>{meta}</p>
          </div>

          {/* Actions */}
          <div className="flex gap-1.5 px-3 pb-2.5">
            <button
              type="button"
              onClick={run(onDetails)}
              className="h-[30px] flex-1 rounded-lg border border-slate-300 bg-white text-xs font-semibold text-primary hover:bg-slate-50"
            >
              Details
            </button>
            {onEdit && (
              <PermissionGuard requireAll={["SECTOR:UPDATE"]}>
                <button
                  type="button"
                  onClick={run(onEdit)}
                  className="h-[30px] flex-1 rounded-lg border border-slate-300 bg-white text-xs font-semibold text-primary hover:bg-slate-50"
                >
                  Edit
                </button>
              </PermissionGuard>
            )}
            <PermissionGuard requireAll={["SECTOR:CREATE"]}>
              <button
                type="button"
                onClick={run(onAddChild)}
                className="h-[30px] flex-[1.4] rounded-lg bg-golden-deep text-xs font-semibold text-white hover:bg-golden-deep/90"
              >
                + Department
              </button>
            </PermissionGuard>
          </div>
        </div>
      </foreignObject>
    </g>
  );
};

/**
 * Hierarchy D3 Tree Component
 * 
 * Displays a hierarchical tree structure using react-d3-tree library.
 * Supports:
 * - Building tree from flat array of structure nodes
 * - Selecting root nodes when multiple roots exist
 * - Interactive tree navigation (zoom, pan, expand/collapse)
 * - Loading and empty states
 * 
 * @param data - Flat array of StructureNode objects
 * @param isLoading - Loading state indicator
 */
const HierarchyD3Tree: React.FC<HierarchyD3TreeProps> = ({
  data,
  isLoading = false,
  onEdit,
}) => {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);
  const [translate, setTranslate] = useState({ x: 0, y: 0 });
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [selectedRootId, setSelectedRootId] = useState("");

  // Modal state for creating child nodes
  const [isCreateChildModalOpen, setIsCreateChildModalOpen] = useState(false);
  const [selectedParentId, setSelectedParentId] = useState<string>("");

  // Handle Add Child button click from CustomNode
  const handleAddChild = (parentId: string) => {
    setSelectedParentId(parentId);
    setIsCreateChildModalOpen(true);
  };

  // Handle modal close
  const handleCloseModal = () => {
    setIsCreateChildModalOpen(false);
    setSelectedParentId("");
  };

  // Build tree structure from flat array using utility function
  const rootNodes = useMemo(
    () => buildSectorTree(data),
    [data]
  );

  // Convert StructureNode tree to D3Tree format for visualization
  const d3TreeData = useMemo(
    () => rootNodes.map(convertToD3Tree),
    [rootNodes]
  );

  // Generate options for root node selector dropdown
  const rootOptions = rootNodes.map((n) => ({
    value: n.sector_node_id,
    label: n.name_am ? `${n.name} — ${n.name_am}` : n.name,
  }));

  // Auto-select first root node if available and none selected
  useEffect(() => {
    if (
      rootOptions.length > 0 &&
      (!selectedRootId ||
        !rootOptions.find((opt) => opt.value === selectedRootId))
    ) {
      setTimeout(() => {
        setSelectedRootId(rootOptions[0].value);
      }, 0);
    }
  }, [rootOptions, selectedRootId]);

  // Get the selected tree node for display
  const selectedTree = useMemo(() => {
    if (!d3TreeData || !selectedRootId || !Array.isArray(d3TreeData))
      return null;
    const node = d3TreeData.find(
      (n) => n.attributes.sector_node_id === selectedRootId
    );
    return node ? [node] : null;
  }, [d3TreeData, selectedRootId]);

  // Handle container resize and calculate tree translation/positioning
  useEffect(() => {
    const updateDimensions = () => {
      if (containerRef.current) {
        const { width, height } = containerRef.current.getBoundingClientRect();
        setDimensions({ width, height });
        // Center tree horizontally, position near top vertically
        setTranslate({ x: width / 2, y: 80 });
      }
    };
    updateDimensions();
    window.addEventListener("resize", updateDimensions);
    return () => window.removeEventListener("resize", updateDimensions);
  }, [selectedTree]);

  // Loading State
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12 min-h-[400px]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-primary text-lg">Loading hierarchy tree...</p>
        </div>
      </div>
    );
  }

  // Empty State - No data available
  if (!d3TreeData || (Array.isArray(d3TreeData) && d3TreeData.length === 0)) {
    return (
      <div className="flex items-center justify-center py-12 min-h-[400px]">
        <div className="text-center">
          <p className="text-gray-500 text-lg font-medium">
            No hierarchy nodes found
          </p>
          <p className="text-gray-400 text-sm mt-2">
            Create a hierarchy node to get started.
          </p>
        </div>
      </div>
    );
  }

  // Main Render
  return (
    <>
      <div className="w-full space-y-4">
        <div
          ref={containerRef}
          className="w-full h-full min-h-[600px] bg-[#F9FBFC] rounded-lg border border-gray-200 overflow-hidden"
          style={{ position: "relative" }}
        >
          {/* Root Node Selector - Only shown when multiple root nodes exist */}
          {rootOptions.length > 1 && (
            <div className="w-[350px] rounded-lg p-4">
              <Label className="text-slate-700 text-sm font-medium">
                Select Root Node
              </Label>
              <Select value={selectedRootId} onValueChange={setSelectedRootId}>
                <SelectTrigger className="w-full h-10 border border-gray-300 px-4 py-3 rounded-md focus:ring focus:ring-primary focus:border-transparent transition-all duration-200 outline-none">
                  <SelectValue placeholder="Select a root node to display" />
                </SelectTrigger>
                <SelectContent>
                  {rootOptions.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Custom styles for tree links */}
          <style>{`.rd3t-link { stroke: #94A3B8 !important; stroke-width: 2.5px !important; fill: none !important; }`}</style>

          {/* Tree Visualization */}
          {selectedTree ? (
            <>
              <div
                id="tree-container"
                className="w-full h-full"
                style={{
                  width: "100%",
                  height: dimensions.height || "600px",
                }}
              >
                <Tree
                  data={selectedTree as unknown as RawNodeDatum[]}
                  translate={translate}
                  orientation="vertical"
                  pathFunc="straight"
                  separation={{ siblings: 1.6, nonSiblings: 1.8 }}
                  nodeSize={{ x: 220, y: 230 }}
                  zoom={0.75}
                  scaleExtent={{ min: 0.1, max: 2 }}
                  enableLegacyTransitions={true}
                  transitionDuration={300}
                  renderCustomNodeElement={(props) => (
                    <CustomNode
                      nodeDatum={
                        props.nodeDatum as unknown as D3TreeNode & {
                          __rd3t?: { collapsed?: boolean };
                        }
                      }
                      toggleNode={props.toggleNode}
                      onAddChild={handleAddChild}
                      onDetails={(id) => router.push(`/basedata/sectors/${id}`)}
                      onEdit={onEdit}
                    />
                  )}
                />
              </div>
              {/* Controls Info Panel */}
              <div className="absolute top-4 right-4 bg-white rounded-lg shadow-lg p-2 border border-gray-200">
                <div className="text-xs text-gray-600 space-y-1">
                  <p className="font-semibold text-primary mb-2">Controls:</p>
                  <p>• Scroll to zoom</p>
                  <p>• Drag to pan</p>
                  <p>• Click nodes to expand/collapse</p>
                </div>
              </div>
            </>
          ) : (
            // No Root Selected State
            <div className="flex items-center justify-center py-12 min-h-[400px]">
              <div className="text-center">
                <p className="text-gray-500 text-lg font-medium">
                  No root node selected
                </p>
                <p className="text-gray-400 text-sm mt-2">
                  Please select a root node from the dropdown above.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
      {/* Create Child Modal */}
      {selectedParentId && (
        <CreateChildModal
          parent_id={selectedParentId}
          isOpen={isCreateChildModalOpen}
          onClose={handleCloseModal}
        />
      )}
    </>
  );
};

export default HierarchyD3Tree;