import { CodeEditor } from '@aiao/code-editor-angular';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { ThemeService } from '@modules/angular';

@Component({
  selector: 'app-code-editor',
  templateUrl: './code-editor.page.html',
  host: { class: 'page-host bg-base-100' },
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CodeEditor]
})
export default class CodeEditorPage {
  #themeService = inject(ThemeService);

  code = signal(`CREATE TABLE IF NOT EXISTS user(
    id INTEGER PRIMARY KEY   AUTOINCREMENT,
    name           TEXT      NOT NULL
);

INSERT INTO user (name) VALUES ('Paul');
INSERT INTO user (name) VALUES ('Jimmy');

select * from user;`);

  theme = this.#themeService.$currentThemeLightDark;
}
