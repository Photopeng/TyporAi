import { DisposableBag } from '@/ui/DisposableBag';

describe('DisposableBag', () => {
  it('disposes resources once in reverse registration order', () => {
    const bag = new DisposableBag(); const calls: string[] = [];
    bag.add(() => calls.push('first')); bag.add(() => calls.push('second'));
    bag.dispose(); bag.dispose();
    expect(calls).toEqual(['second', 'first']);
  });
});
