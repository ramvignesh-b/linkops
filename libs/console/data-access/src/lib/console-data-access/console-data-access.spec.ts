import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { ConsoleDataAccess } from './console-data-access';

describe('ConsoleDataAccess', () => {
  let component: ConsoleDataAccess;
  let fixture: ComponentFixture<ConsoleDataAccess>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ConsoleDataAccess],
    }).compileComponents();

    fixture = TestBed.createComponent(ConsoleDataAccess);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
