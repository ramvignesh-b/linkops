import { ChangeDetectionStrategy, Component } from '@angular/core';
import { AssistantPanel } from '@linkops/console/feature-assistant';

/**
 * This remote's own shell, for `nx serve assistant` in isolation — Module
 * Federation never reaches it. What Module Federation exposes is
 * `AssistantPanel` itself, named directly in `federation.config.mjs`'s
 * `exposes` map, not this wrapper.
 */
@Component({
  selector: 'app-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AssistantPanel],
  template: `<lib-assistant-panel />`,
})
export class App {}
