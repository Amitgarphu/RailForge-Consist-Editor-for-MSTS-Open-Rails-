/**
 * RailForge Consist - Left Workspace Navigation Sidebar
 * @license Apache-2.0
 */

import React from 'react';
import { 
  Box, 
  Layers, 
  BookOpen, 
  RefreshCw, 
  Archive, 
  Settings, 
  Info,
  ChevronLeft,
  ChevronRight,
  Train
} from 'lucide-react';

export type ActiveTab = 'builder' | 'catalogue' | 'master' | 'recovery' | 'library';

interface SidebarProps {
  activeTab: ActiveTab;
  onSelectTab: (tab: ActiveTab) => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  onOpenSettings: () => void;
  onOpenAbout: () => void;
  stockCount: number;
  recoveryCount: number;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  onSelectTab,
  isCollapsed,
  onToggleCollapse,
  onOpenSettings,
  onOpenAbout,
  stockCount,
  recoveryCount
}) => {
  const navItems = [
    {
      id: 'builder' as ActiveTab,
      label: 'Consist Builder',
      icon: Box,
      description: '3D Viewport & Timeline'
    },
    {
      id: 'catalogue' as ActiveTab,
      label: 'Trainset Catalogue',
      icon: Layers,
      count: stockCount
    },
    {
      id: 'master' as ActiveTab,
      label: 'Master Consists',
      icon: BookOpen,
      badge: 'Blueprints'
    },
    {
      id: 'recovery' as ActiveTab,
      label: 'Recovery Workbench',
      icon: RefreshCw,
      badge: recoveryCount > 0 ? `${recoveryCount}` : undefined
    },
    {
      id: 'library' as ActiveTab,
      label: 'Consist Library',
      icon: Archive
    }
  ];

  return (
    <aside
      className={`bg-[#090B0D] border-r border-[#252D36] flex flex-col justify-between transition-all duration-200 select-none shrink-0 ${
        isCollapsed ? 'w-14' : 'w-56'
      }`}
    >
      {/* Top Brand Block */}
      <div>
        <div className="flex items-center justify-between p-3.5 border-b border-[#252D36]">
          {!isCollapsed && (
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded bg-[#14191F] border border-[#252D36] flex items-center justify-center text-[#79A997]">
                <Train className="w-3.5 h-3.5" />
              </div>
              <div>
                <span className="text-xs font-bold tracking-tight text-[#E8EDF2] font-heading block leading-none">
                  RAILFORGE
                </span>
                <span className="text-[9px] font-mono tracking-widest text-[#65717E] uppercase block mt-0.5">
                  Build. Assemble. Run.
                </span>
              </div>
            </div>
          )}

          <button
            onClick={onToggleCollapse}
            title={isCollapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
            className="p-1 text-[#65717E] hover:text-[#E8EDF2] rounded hover:bg-[#14191F] transition-colors mx-auto"
          >
            {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </button>
        </div>

        {/* Nav Items */}
        <nav className="p-2 space-y-1">
          {navItems.map(item => {
            const isActive = activeTab === item.id;
            const Icon = item.icon;

            return (
              <button
                key={item.id}
                onClick={() => onSelectTab(item.id)}
                title={isCollapsed ? item.label : undefined}
                className={`w-full flex items-center gap-3 px-2.5 py-2 rounded text-xs font-medium transition-colors ${
                  isActive
                    ? 'bg-[#14191F] text-[#79A997] border border-[#252D36]'
                    : 'text-[#929DA9] hover:text-[#E8EDF2] hover:bg-[#14191F]/60'
                }`}
              >
                <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-[#79A997]' : 'text-[#65717E]'}`} />

                {!isCollapsed && (
                  <div className="flex items-center justify-between w-full">
                    <span className="truncate">{item.label}</span>
                    {item.count !== undefined && (
                      <span className="font-mono text-[10px] text-[#65717E] tabular-nums">
                        {item.count}
                      </span>
                    )}
                    {item.badge && (
                      <span className="text-[10px] font-mono px-1.5 py-0.2 bg-[#1A2028] text-[#79A997] rounded border border-[#252D36]">
                        {item.badge}
                      </span>
                    )}
                  </div>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Bottom Footer Links */}
      <div className="p-2 border-t border-[#252D36] space-y-1">
        <button
          onClick={onOpenSettings}
          title={isCollapsed ? 'Settings' : undefined}
          className="w-full flex items-center gap-3 px-2.5 py-1.5 rounded text-xs text-[#65717E] hover:text-[#E8EDF2] hover:bg-[#14191F] transition-colors"
        >
          <Settings className="w-4 h-4 shrink-0" />
          {!isCollapsed && <span>Settings</span>}
        </button>

        <button
          onClick={onOpenAbout}
          title={isCollapsed ? 'About' : undefined}
          className="w-full flex items-center gap-3 px-2.5 py-1.5 rounded text-xs text-[#65717E] hover:text-[#E8EDF2] hover:bg-[#14191F] transition-colors"
        >
          <Info className="w-4 h-4 shrink-0" />
          {!isCollapsed && <span>About</span>}
        </button>
      </div>
    </aside>
  );
};
