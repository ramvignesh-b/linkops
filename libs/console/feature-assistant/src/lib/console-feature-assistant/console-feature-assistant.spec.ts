import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { ConsoleFeatureAssistant } from './console-feature-assistant';

describe('ConsoleFeatureAssistant', () => {
  let component: ConsoleFeatureAssistant;
  let fixture: ComponentFixture<ConsoleFeatureAssistant>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ConsoleFeatureAssistant],
    }).compileComponents();

    fixture = TestBed.createComponent(ConsoleFeatureAssistant);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
