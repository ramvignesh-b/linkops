import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { ConsoleFeatureFleet } from './console-feature-fleet';

describe('ConsoleFeatureFleet', () => {
  let component: ConsoleFeatureFleet;
  let fixture: ComponentFixture<ConsoleFeatureFleet>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ConsoleFeatureFleet],
    }).compileComponents();

    fixture = TestBed.createComponent(ConsoleFeatureFleet);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
