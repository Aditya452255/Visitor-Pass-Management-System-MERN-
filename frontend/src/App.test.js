import { render } from '@testing-library/react';
import Loader from './components/Shared/Loader';

test('renders loader component', () => {
  const { container } = render(<Loader />);
  expect(container).toBeDefined();
});
