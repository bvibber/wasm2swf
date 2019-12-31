#include <inttypes.h>

int32_t sample_add_i32(int32_t a, int32_t b) {
    return a + b;
}

int64_t sample_add_i64(int64_t a, int64_t b) {
    return a + b;
}

float sample_add_f32(float a, float b) {
    return a + b;
}

double sample_add_f64(double a, double b) {
    return a + b;
}

int32_t mandelbrot(int32_t max_iters, double cx, double cy) {
    double x0 = cx;
    double y0 = cy;
    double x = 0.0;
    double y = 0.0;
    int32_t iter = 0;
    while (x * x + y * y <= 4 && iter < max_iters) {
        double xtemp = x * x - y * y + x0;
        y = 2 * x * y + y0;
        x = xtemp;
        iter++;
    }
    return iter;
}

void filter_line(uint8_t* dest, const uint8_t* src, int32_t len) {
    dest[0] = src[0];
    for (int32_t i = 1; i < len; i++) {
        dest[i] = src[i] - src[i - 1];
    }
}
