import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { ConsoleFeatureLinkDetail } from './console-feature-link-detail';

describe('ConsoleFeatureLinkDetail', () => {
  let component: ConsoleFeatureLinkDetail;
  let fixture: ComponentFixture<ConsoleFeatureLinkDetail>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ConsoleFeatureLinkDetail],
    }).compileComponents();

    fixture = TestBed.createComponent(ConsoleFeatureLinkDetail);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
