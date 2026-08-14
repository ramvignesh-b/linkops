import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { ConsoleUi } from './console-ui';

describe('ConsoleUi', () => {
  let component: ConsoleUi;
  let fixture: ComponentFixture<ConsoleUi>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ConsoleUi],
    }).compileComponents();

    fixture = TestBed.createComponent(ConsoleUi);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
