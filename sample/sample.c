int sample_add_i32(int a, int b) {
    return a + b;
}

long long sample_add_i64(long long a, long long b) {
    return a + b;
}

float sample_add_f32(float a, float b) {
    return a + b;
}

double sample_add_f64(double a, double b) {
    return a + b;
}

int mandelbrot(int max_iters, double cx, double cy) {
    double x0 = cx;
    double y0 = cy;
    double x = 0.0;
    double y = 0.0;
    int iter = 0;
    while (x * x + y * y <= 4 && iter < max_iters) {
        double xtemp = x * x - y * y + x0;
        y = 2 * x * y + y0;
        x = xtemp;
        iter++;
    }
    return iter;
}
