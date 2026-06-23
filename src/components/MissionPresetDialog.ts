import {
  MISSION_PRESETS,
  applyMissionPresetToState,
  resetMissionPresetState,
  saveMissionPreset,
  clearMissionPreset,
  loadStoredMissionPreset,
  type MissionPresetId,
} from '@/services/mission-presets';
import type { MapLayers, PanelConfig } from '@/types';
import { escapeHtml } from '@/utils/sanitize';

export interface MissionPresetCallbacks {
  getPanelSettings: () => Record<string, PanelConfig>;
  applyPanelSettings: (settings: Record<string, PanelConfig>, order: string[]) => void;
  applyMapLayers: (layers: MapLayers) => void;
  setMapView: (view: string) => void;
  reloadDashboard: () => void;
}

export function openMissionPresetDialog(callbacks: MissionPresetCallbacks): void {
  const existing = document.querySelector('.mission-preset-overlay');
  if (existing) { existing.remove(); return; }

  const activePreset = loadStoredMissionPreset();

  const overlay = document.createElement('div');
  overlay.className = 'mission-preset-overlay';

  const dialog = document.createElement('div');
  dialog.className = 'mission-preset-dialog';

  const header = document.createElement('div');
  header.className = 'mission-preset-header';
  header.innerHTML = `
    <div>
      <div class="mission-preset-label">MISSION</div>
      <div class="mission-preset-title">Choose Workspace</div>
    </div>
    <div class="mission-preset-header-actions">
      <button class="mission-preset-reset" title="Reset to defaults">RESET</button>
      <button class="mission-preset-close" aria-label="Close">×</button>
    </div>
  `;

  const list = document.createElement('div');
  list.className = 'mission-preset-list';

  for (const preset of MISSION_PRESETS) {
    const card = document.createElement('button');
    card.className = `mission-preset-card${activePreset?.id === preset.id ? ' active' : ''}`;
    card.dataset.presetId = preset.id;
    card.innerHTML = `
      <div class="mission-preset-icon">${escapeHtml(preset.icon)}</div>
      <div class="mission-preset-info">
        <div class="mission-preset-name">${escapeHtml(preset.label)}</div>
        <div class="mission-preset-desc">${escapeHtml(preset.description)}</div>
      </div>
    `;
    card.addEventListener('click', () => {
      try {
        const result = applyMissionPresetToState(
          preset.id as MissionPresetId,
          callbacks.getPanelSettings(),
        );
        saveMissionPreset(preset.id as MissionPresetId);
        callbacks.applyPanelSettings(result.panelSettings, result.panelOrder);
        callbacks.applyMapLayers(result.mapLayers);
        callbacks.setMapView(preset.view);
        close();
        callbacks.reloadDashboard();
      } catch (err) {
        console.error('[Mission] Failed to apply preset:', err);
      }
    });
    list.appendChild(card);
  }

  dialog.appendChild(header);
  dialog.appendChild(list);
  overlay.appendChild(dialog);

  const close = () => {
    overlay.remove();
    document.removeEventListener('keydown', onEsc);
  };
  const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onEsc);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  header.querySelector('.mission-preset-close')?.addEventListener('click', close);
  header.querySelector('.mission-preset-reset')?.addEventListener('click', () => {
    try {
      const result = resetMissionPresetState(callbacks.getPanelSettings());
      clearMissionPreset();
      callbacks.applyPanelSettings(result.panelSettings, result.panelOrder);
      callbacks.applyMapLayers(result.mapLayers);
      close();
      callbacks.reloadDashboard();
    } catch (err) {
      console.error('[Mission] Failed to reset:', err);
    }
  });

  document.body.appendChild(overlay);
}
